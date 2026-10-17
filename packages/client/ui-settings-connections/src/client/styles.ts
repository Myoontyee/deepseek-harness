/** Theme-aware saved-server settings layout. */
export const connectionStyles = `
.dsh-device-hub { padding: 28px; overflow: auto; height: 100%; box-sizing: border-box; }
.dsh-device-session { display: flex; justify-content: space-between; gap: 12px; text-align: left; }
.dsh-connections textarea { min-height: 90px; width: 100%; box-sizing: border-box; }
.dsh-connections { display:flex; flex-direction:column; gap:16px; color:var(--dsw-alias-label-primary); min-width:0; }
.dsh-connections h2 { font-weight:500; margin:0; }
.dsh-connections p { margin:0; color:var(--dsw-alias-label-secondary); line-height:1.6; }
.dsh-connections fieldset { border:0; padding:0; margin:0; display:flex; flex-direction:column; gap:16px; min-width:0; }
.dsh-connections label { display:flex; flex-direction:column; gap:8px; }
.dsh-connections .check { flex-direction:row; align-items:center; }
.dsh-connections input:not([type=checkbox]),.dsh-connections select { padding:10px; border:0.5px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-sm); color:inherit; background:var(--dsw-alias-bg-layer-1); min-width:0; }
.dsh-connections .card { padding:18px; border:0.5px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-md); background:var(--dsw-alias-settings-card-fill); display:flex; flex-direction:column; gap:16px; }
.dsh-connections .actions { display:flex; gap:8px; flex-wrap:wrap; }
.dsh-connections button { padding:9px 14px; border:0.5px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-sm); color:inherit; background:var(--dsw-alias-bg-layer-2); cursor:pointer; }
.dsh-connections button:disabled { opacity:.5; cursor:default; }
.dsh-connections .error { color:var(--dsw-alias-state-error-primary); overflow-wrap:anywhere; }
.dsh-connections .result { overflow-wrap:anywhere; white-space:pre-wrap; }

.dsh-device-inventory { border:0.5px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-md); background:var(--dsw-alias-settings-card-fill); container-type:inline-size; }
.dsh-device-inventory-heading { padding:18px 20px; }
.dsh-device-inventory-heading h3 { margin:0; font-size:inherit; font-weight:600; }
.dsh-device-table { width:100%; border-collapse:collapse; text-align:left; }
.dsh-device-table th,.dsh-device-table td { padding:14px 20px; vertical-align:middle; overflow-wrap:anywhere; }
.dsh-device-table thead { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary); }
.dsh-device-table thead th { font-weight:500; font-size:.9em; }
.dsh-device-table tbody th { font-weight:500; }
.dsh-device-table tbody tr { border-top:0.5px solid var(--dsw-alias-border-l4); }
.dsh-device-name { display:flex; align-items:center; gap:10px; min-width:0; }
.dsh-device-name svg { flex-shrink:0; color:var(--dsw-alias-label-secondary); }
.dsh-device-table code { font-size:.9em; white-space:nowrap; }
.dsh-device-status { display:inline-flex; align-items:center; gap:8px; font-size:.9em; }
.dsh-device-status-dot { width:7px; height:7px; flex-shrink:0; border-radius:50%; background:var(--dsw-alias-label-secondary); }
.dsh-device-status[data-online=true] .dsh-device-status-dot { background:var(--dsw-alias-state-success-primary); }
.dsh-device-table .dsh-device-actions { text-align:right; }
.dsh-device-actions button { white-space:nowrap; }
.dsh-device-muted { color:var(--dsw-alias-label-secondary); font-size:.9em; }
.dsh-device-empty { padding:0 20px 20px; }
@media (hover:hover) { .dsh-device-table tbody tr:hover { background:var(--dsw-alias-bg-layer-2); } }
@container (max-width:760px) {
  .dsh-device-table,.dsh-device-table tbody,.dsh-device-table tr,.dsh-device-table th,.dsh-device-table td { display:block; }
  .dsh-device-table thead { display:none; }
  .dsh-device-table tbody tr { padding:14px 16px; }
  .dsh-device-table tbody th { padding:0 0 10px; }
  .dsh-device-table tbody td { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:6px 0; }
  .dsh-device-table td::before { content:attr(data-label); color:var(--dsw-alias-label-secondary); font-size:.9em; flex-shrink:0; }
}
`
