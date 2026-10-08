/** Theme-aware saved-server settings layout. */
export const connectionStyles = `
.dsh-connections { display:flex; flex-direction:column; gap:16px; color:var(--dsw-alias-label-primary); min-width:0; }
.dsh-connections h2 { font-weight:500; margin:0; }
.dsh-connections p { margin:0; color:var(--dsw-alias-label-secondary); line-height:1.6; }
.dsh-connections fieldset { border:0; padding:0; margin:0; display:flex; flex-direction:column; gap:16px; min-width:0; }
.dsh-connections label { display:flex; flex-direction:column; gap:8px; }
.dsh-connections .check { flex-direction:row; align-items:center; }
.dsh-connections input:not([type=checkbox]),.dsh-connections select { padding:10px; border:1px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-sm); color:inherit; background:var(--dsw-alias-bg-layer-1); min-width:0; }
.dsh-connections .card { padding:18px; border:1px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-md); background:var(--dsw-alias-settings-card-fill); display:flex; flex-direction:column; gap:16px; }
.dsh-connections .actions { display:flex; gap:8px; flex-wrap:wrap; }
.dsh-connections button { padding:9px 14px; border:1px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-sm); color:inherit; background:var(--dsw-alias-bg-layer-2); cursor:pointer; }
.dsh-connections button:disabled { opacity:.5; cursor:default; }
.dsh-connections .error { color:var(--dsw-alias-state-error-primary); overflow-wrap:anywhere; }
.dsh-connections .result { overflow-wrap:anywhere; white-space:pre-wrap; }
`
