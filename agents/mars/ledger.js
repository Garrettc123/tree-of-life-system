/**
 * Detach-safe audit ledger. Committed rows survive organ detach.
 */

class Ledger {
  constructor() {
    this.rows = [];
  }

  append(row) {
    const sealed = {
      ...row,
      seq: this.rows.length + 1,
      ts: row.ts || new Date().toISOString(),
      retained_on_detach: true,
    };
    this.rows.push(sealed);
    return sealed;
  }

  committed() {
    return this.rows.filter((r) => r.decision === 'commit' || r.state === 'SEALED');
  }

  export() {
    return this.rows.slice();
  }

  freeze() {
    this.frozen = true;
  }

  get frozenWrites() {
    return Boolean(this.frozen);
  }
}

module.exports = Ledger;
