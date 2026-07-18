// The undo bus (docs/sheets/PLAN.md §3): every block mutation is a command
// with an inverse, so undo/redo works for structural edits and (coalesced)
// text edits alike. Pure model layer — persistence and re-rendering happen in
// the owner's onChange, never here.

export interface Command {
  apply(): void;
  revert(): void;
  /** short human label, for debugging and a future history UI */
  label?: string;
}

export class CommandBus {
  private undos: Command[] = [];
  private redos: Command[] = [];

  /** onChange runs after execute/undo/redo — the owner saves and re-renders.
   *  It does NOT run on record(): a recorded command was already applied and
   *  saved live (contenteditable input), and re-rendering on blur would
   *  destroy whatever the user just clicked on. */
  constructor(
    private onChange: () => void,
    private limit = 200,
  ) {}

  execute(cmd: Command): void {
    cmd.apply();
    this.push(cmd);
    this.onChange();
  }

  /** Record an ALREADY-APPLIED command (a coalesced text-edit session). */
  record(cmd: Command): void {
    this.push(cmd);
  }

  /** For toolbar button disabled-state — history depth, not behavior. */
  get canUndo(): boolean {
    return this.undos.length > 0;
  }

  get canRedo(): boolean {
    return this.redos.length > 0;
  }

  undo(): boolean {
    const cmd = this.undos.pop();
    if (!cmd) return false;
    cmd.revert();
    this.redos.push(cmd);
    this.onChange();
    return true;
  }

  redo(): boolean {
    const cmd = this.redos.pop();
    if (!cmd) return false;
    cmd.apply();
    this.undos.push(cmd);
    this.onChange();
    return true;
  }

  /** Drop all history. Call whenever the underlying model objects are
   *  REPLACED (store reloaded after an external write, sheet switched,
   *  Drive restore) — old commands would mutate detached objects. */
  clear(): void {
    this.undos.length = 0;
    this.redos.length = 0;
  }

  private push(cmd: Command): void {
    this.undos.push(cmd);
    if (this.undos.length > this.limit) this.undos.shift();
    this.redos.length = 0;
  }
}
