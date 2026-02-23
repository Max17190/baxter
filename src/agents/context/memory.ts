import { Database } from "bun:sqlite";
import { join } from "node:path";
import type { Fact } from "../../types.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  agent TEXT NOT NULL,
  tool TEXT,
  confidence REAL NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  source_url TEXT,
  source_description TEXT,
  validated INTEGER DEFAULT 0,
  validation_notes TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  query TEXT
);

CREATE INDEX IF NOT EXISTS idx_facts_agent ON facts(agent);
CREATE INDEX IF NOT EXISTS idx_facts_created ON facts(created_at);
CREATE INDEX IF NOT EXISTS idx_facts_query ON facts(query);

CREATE TABLE IF NOT EXISTS queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  complexity TEXT,
  answer TEXT,
  confidence REAL,
  cost_usd REAL,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_queries_created ON queries(created_at);
`;

/** SQLite-backed cross-session memory for facts and queries */
export class Memory {
  private db: Database;

  constructor(dbPath?: string) {
    const path = dbPath ?? join(process.cwd(), ".baxter", "memory.db");
    this.db = new Database(path);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  /** Store facts from a research session */
  storeFacts(facts: Fact[], query: string, ttlMs?: number): void {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO facts (id, content, agent, tool, confidence, tags, source_url, source_description, validated, validation_notes, created_at, expires_at, query)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    const expiresAt = ttlMs ? now + ttlMs : null;

    const insertMany = this.db.transaction(() => {
      for (const fact of facts) {
        insert.run(
          fact.id,
          fact.content,
          fact.provenance.agent,
          fact.provenance.tool ?? null,
          fact.confidence,
          JSON.stringify(fact.tags),
          fact.provenance.sourceUrl ?? null,
          fact.provenance.sourceDescription ?? null,
          fact.validated ? 1 : 0,
          fact.validationNotes ?? null,
          now,
          expiresAt,
          query,
        );
      }
    });

    insertMany();
  }

  /** Retrieve relevant facts for a query */
  findFacts(options: {
    query?: string;
    agent?: string;
    minConfidence?: number;
    limit?: number;
  }): Fact[] {
    const conditions: string[] = ["(expires_at IS NULL OR expires_at > ?)"];
    const params: (string | number)[] = [Date.now()];

    if (options.agent) {
      conditions.push("agent = ?");
      params.push(options.agent);
    }
    if (options.minConfidence) {
      conditions.push("confidence >= ?");
      params.push(options.minConfidence);
    }
    if (options.query) {
      conditions.push("query = ?");
      params.push(options.query);
    }

    const sql = `
      SELECT * FROM facts
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT ?
    `;
    params.push(options.limit ?? 100);

    const rows = this.db.prepare(sql).all(...params) as FactRow[];
    return rows.map(rowToFact);
  }

  /** Store a completed query for history */
  storeQuery(data: {
    query: string;
    complexity?: string;
    answer?: string;
    confidence?: number;
    costUsd?: number;
    durationMs?: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO queries (query, complexity, answer, confidence, cost_usd, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.query,
        data.complexity ?? null,
        data.answer ?? null,
        data.confidence ?? null,
        data.costUsd ?? null,
        data.durationMs ?? null,
        Date.now(),
      );
  }

  /** Get recent queries */
  getRecentQueries(limit = 10): Array<{ query: string; answer: string; createdAt: number }> {
    const rows = this.db
      .prepare("SELECT query, answer, created_at FROM queries ORDER BY created_at DESC LIMIT ?")
      .all(limit) as Array<{ query: string; answer: string; created_at: number }>;

    return rows.map((r) => ({
      query: r.query,
      answer: r.answer,
      createdAt: r.created_at,
    }));
  }

  /** Clean up expired facts */
  cleanup(): number {
    const result = this.db
      .prepare("DELETE FROM facts WHERE expires_at IS NOT NULL AND expires_at < ?")
      .run(Date.now());
    return result.changes;
  }

  close(): void {
    this.db.close();
  }
}

interface FactRow {
  id: string;
  content: string;
  agent: string;
  tool: string | null;
  confidence: number;
  tags: string;
  source_url: string | null;
  source_description: string | null;
  validated: number;
  validation_notes: string | null;
  created_at: number;
  query: string | null;
}

function rowToFact(row: FactRow): Fact {
  return {
    id: row.id,
    content: row.content,
    provenance: {
      agent: row.agent,
      tool: row.tool ?? undefined,
      timestamp: row.created_at,
      sourceUrl: row.source_url ?? undefined,
      sourceDescription: row.source_description ?? undefined,
    },
    confidence: row.confidence,
    tags: JSON.parse(row.tags),
    validated: row.validated === 1,
    validationNotes: row.validation_notes ?? undefined,
  };
}
