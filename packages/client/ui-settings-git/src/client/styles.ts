/** Theme-token-based Git page layout. */
export const gitStyles = `
.dsh-git-settings { display:flex; flex-direction:column; gap:16px; min-width:0; color:var(--dsw-alias-label-primary); font:var(--dsw-font-size-base,14px) var(--dsw-font-family); }
.dsh-git-settings h2,.dsh-git-settings h3 { font-weight:500; margin:0; }
.dsh-git-settings .row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.dsh-git-settings .row label { display:flex; align-items:center; gap:8px; }
.dsh-git-settings input:not([type=checkbox]),.dsh-git-settings select,.dsh-git-settings textarea { background:var(--dsw-alias-bg-layer-1); color:inherit; border:1px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-sm); padding:8px; min-width:0; }
.dsh-git-settings button { background:var(--dsw-alias-bg-layer-2); color:inherit; border:1px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-sm); padding:7px 12px; cursor:pointer; }
.dsh-git-settings button:disabled { opacity:.5; cursor:default; }
.dsh-git-settings button[aria-pressed=true] { border-color:var(--dsw-alias-state-business-primary); }
.dsh-git-settings .panes { display:grid; grid-template-columns:minmax(240px,1fr) minmax(260px,1fr); gap:12px; min-height:240px; }
.dsh-git-settings .panel { border:1px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-md); padding:12px; min-width:0; display:flex; flex-direction:column; gap:10px; background:var(--dsw-alias-settings-card-fill); }
.dsh-git-settings .scroll { overflow:auto; max-height:380px; }
.dsh-git-settings .file { display:flex; align-items:center; gap:8px; padding:6px 0; }
.dsh-git-settings .file button { border:0; text-align:left; background:none; padding:4px; overflow-wrap:anywhere; }
.dsh-git-settings .file.selected { background:var(--dsw-alias-bg-layer-3); }
.dsh-git-settings .file code { white-space:pre; min-width:2em; }
.dsh-git-settings pre { margin:0; white-space:pre; overflow:auto; font:13px var(--ds-font-family-code); }
.dsh-git-settings .error { color:var(--dsw-alias-state-error-primary); overflow-wrap:anywhere; }
.dsh-git-settings .commit { padding:6px 0; border-bottom:1px solid var(--dsw-alias-border-l4); overflow-wrap:anywhere; }
.dsh-git-settings .path { overflow-wrap:anywhere; font-size:13px; }
.dsh-git-settings fieldset { border:0; padding:0; margin:0; display:flex; flex-direction:column; gap:12px; min-width:0; }
@media(max-width:850px) { .dsh-git-settings .panes { grid-template-columns:minmax(0,1fr); } }
`
