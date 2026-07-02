import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PANEL_CSS } from '../../../shared/ui/panel-css';
import { Icon } from '../../../shared/ui/components/icons';
import { OverlayControlShell } from '../../../shared/ui/components/overlay-controls';
import { ProviderIdentity } from '../../../shared/ui/components/provider-identity';
import { IconButton } from '../../../shared/ui/primitives/icon-button';
import { Button, TextField } from '../../../shared/ui/primitives/native-controls';

type HarnessPanelWidthMode = 'compact' | 'regular' | 'wide';
type HarnessPanelHeightMode = 'short' | 'normal';

const PANEL_COMPACT_MAX_WIDTH = 339;
const PANEL_WIDE_MIN_WIDTH = 520;
const PANEL_SHORT_MAX_HEIGHT = 459;

const HARNESS_CSS = `
.uxp-css-harness-root{
  width:100%;
  height:100%;
  min-width:0;
  min-height:0;
  background:
    radial-gradient(circle at top left, rgba(88,168,255,.10), transparent 30%),
    linear-gradient(180deg, #f4f7fb 0%, #e8eef6 100%);
  color:#17202c;
}
.uxp-css-harness-page{
  display:flex;
  flex-direction:column;
  flex:1 1 auto;
  min-width:0;
  min-height:0;
  overflow:hidden;
}
.uxp-css-harness-scroll{
  overflow-y:auto;
  flex:1 1 auto;
  min-width:0;
  min-height:0;
}
.uxp-css-harness-scroll::-webkit-scrollbar{ width:3px; }
.uxp-css-harness-scroll::-webkit-scrollbar-thumb{ background:var(--app-color-border-default); border-radius:2px; }
.uxp-css-harness-page-inner{
  min-width:0;
  min-height:100%;
  padding-top:24px;
  padding-right:24px;
  padding-bottom:32px;
  padding-left:24px;
}
.uxp-css-harness-shell{
  width:min(1180px, 100%);
  margin-top:0;
  margin-right:auto;
  margin-bottom:0;
  margin-left:auto;
}
.uxp-css-hero{
  border:1px solid #c8d4e3;
  border-radius:20px;
  background:rgba(255,255,255,.94);
  overflow:hidden;
}
.uxp-css-hero-head{
  padding-top:18px;
  padding-right:20px;
  padding-bottom:16px;
  padding-left:20px;
  border-bottom:1px solid #d8e2ee;
}
.uxp-css-eyebrow{
  margin-top:0;
  margin-right:0;
  margin-bottom:8px;
  margin-left:0;
  font-family:var(--app-font-family-mono);
  font-size:11px;
  line-height:15px;
  letter-spacing:.04em;
  text-transform:uppercase;
  color:#516274;
}
.uxp-css-hero-title{
  margin-top:0;
  margin-right:0;
  margin-bottom:8px;
  margin-left:0;
  font-family:var(--app-font-family-display);
  font-size:28px;
  line-height:32px;
  font-weight:600;
  color:#152030;
}
.uxp-css-hero-copy{
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
  max-width:780px;
  font-family:var(--app-font-family-base);
  font-size:13px;
  line-height:19px;
  color:#415264;
}
.uxp-css-runtime-note{
  margin-top:12px;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
  padding-top:10px;
  padding-right:12px;
  padding-bottom:10px;
  padding-left:12px;
  border:1px solid #d8e2ee;
  border-radius:12px;
  background:rgba(247,250,253,.96);
  font-family:var(--app-font-family-mono);
  font-size:10px;
  line-height:15px;
  color:#4d5f72;
  white-space:pre-wrap;
}
.uxp-css-legend{
  display:flex;
  flex-wrap:wrap;
  padding-top:14px;
  padding-right:20px;
  padding-bottom:16px;
  padding-left:20px;
  border-bottom:1px solid #d8e2ee;
  background:rgba(237,243,250,.92);
}
.uxp-css-legend-item{
  display:inline-flex;
  align-items:center;
  margin-top:0;
  margin-right:12px;
  margin-bottom:8px;
  margin-left:0;
  padding-top:7px;
  padding-right:10px;
  padding-bottom:7px;
  padding-left:10px;
  border:1px solid #d2ddea;
  border-radius:999px;
  background:#ffffff;
  font-family:var(--app-font-family-mono);
  font-size:11px;
  line-height:15px;
  color:#334152;
}
.uxp-css-legend-item:last-child{
  margin-right:0;
}
.uxp-css-legend-dot{
  width:10px;
  height:10px;
  border-radius:999px;
  flex:0 0 auto;
  margin-top:0;
  margin-right:8px;
  margin-bottom:0;
  margin-left:0;
}
.uxp-css-legend-dot[data-tone="pass"]{ background:#1f8f5f; }
.uxp-css-legend-dot[data-tone="check"]{ background:#d99308; }
.uxp-css-legend-dot[data-tone="fail"]{ background:#cd4a4a; }
.uxp-css-grid{
  display:flex;
  flex-wrap:wrap;
  padding-top:20px;
  padding-right:20px;
  padding-bottom:8px;
  padding-left:20px;
}
.uxp-css-card{
  display:flex;
  flex-direction:column;
  width:calc(50% - 10px);
  min-width:280px;
  margin-top:0;
  margin-right:20px;
  margin-bottom:20px;
  margin-left:0;
  border:1px solid #cfd9e5;
  border-radius:18px;
  background:#ffffff;
  overflow:hidden;
}
.uxp-css-card:nth-child(2n){
  margin-right:0;
}
.uxp-css-card-head{
  padding-top:16px;
  padding-right:16px;
  padding-bottom:14px;
  padding-left:16px;
  border-bottom:1px solid #dde6f0;
  background:rgba(246,249,252,.96);
}
.uxp-css-card-top{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  min-width:0;
}
.uxp-css-card-title-wrap{
  display:flex;
  flex-direction:column;
  min-width:0;
  flex:1 1 auto;
}
.uxp-css-card-title{
  margin-top:0;
  margin-right:0;
  margin-bottom:4px;
  margin-left:0;
  font-family:var(--app-font-family-display);
  font-size:16px;
  line-height:20px;
  font-weight:600;
  color:#162132;
}
.uxp-css-card-subtitle{
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
  font-family:var(--app-font-family-mono);
  font-size:11px;
  line-height:15px;
  color:#546577;
  text-transform:uppercase;
  letter-spacing:.03em;
}
.uxp-css-status{
  display:inline-flex;
  align-items:center;
  flex:0 0 auto;
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:12px;
  padding-top:6px;
  padding-right:9px;
  padding-bottom:6px;
  padding-left:9px;
  border:1px solid transparent;
  border-radius:999px;
  font-family:var(--app-font-family-mono);
  font-size:11px;
  line-height:14px;
  letter-spacing:.03em;
  text-transform:uppercase;
}
.uxp-css-status[data-tone="pass"]{
  color:#145b40;
  background:#dff4ea;
  border-color:#b8e1cd;
}
.uxp-css-status[data-tone="check"]{
  color:#7f5800;
  background:#fff3d6;
  border-color:#efd38c;
}
.uxp-css-status[data-tone="fail"]{
  color:#7d2727;
  background:#fde2e2;
  border-color:#efb5b5;
}
.uxp-css-card-copy{
  margin-top:12px;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
  font-family:var(--app-font-family-base);
  font-size:12px;
  line-height:18px;
  color:#415264;
}
.uxp-css-card-body{
  display:flex;
  flex-direction:column;
  padding-top:16px;
  padding-right:16px;
  padding-bottom:16px;
  padding-left:16px;
}
.uxp-css-card-body > *{
  margin-top:14px;
}
.uxp-css-card-body > *:first-child{
  margin-top:0;
}
.uxp-css-rule-list{
  display:flex;
  flex-wrap:wrap;
}
.uxp-css-rule{
  display:inline-flex;
  align-items:center;
  margin-top:0;
  margin-right:8px;
  margin-bottom:8px;
  margin-left:0;
  padding-top:6px;
  padding-right:8px;
  padding-bottom:6px;
  padding-left:8px;
  border:1px solid #dce5ef;
  border-radius:10px;
  background:#f6f9fc;
  font-family:var(--app-font-family-mono);
  font-size:11px;
  line-height:15px;
  color:#304052;
}
.uxp-css-rule[data-tone="bad"]{
  border-color:#ebc6c6;
  background:#fdf1f1;
  color:#8a3030;
}
.uxp-css-eval{
  display:flex;
  flex-direction:column;
  padding-top:12px;
  padding-right:12px;
  padding-bottom:12px;
  padding-left:12px;
  border:1px dashed #ced9e5;
  border-radius:14px;
  background:#fbfcfe;
}
.uxp-css-eval-label{
  margin-top:0;
  margin-right:0;
  margin-bottom:8px;
  margin-left:0;
  font-family:var(--app-font-family-mono);
  font-size:10px;
  line-height:14px;
  color:#607183;
  letter-spacing:.04em;
  text-transform:uppercase;
}
.uxp-css-eval-list{
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:18px;
  padding-top:0;
  padding-right:0;
  padding-bottom:0;
  padding-left:0;
}
.uxp-css-eval-list li{
  margin-top:6px;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
  font-family:var(--app-font-family-base);
  font-size:12px;
  line-height:17px;
  color:#415264;
}
.uxp-css-eval-list li:first-child{
  margin-top:0;
}
.uxp-css-demo{
  padding-top:14px;
  padding-right:14px;
  padding-bottom:14px;
  padding-left:14px;
  border:1px solid #d9e3ee;
  border-radius:16px;
  background:linear-gradient(180deg, #f8fbfe 0%, #eef4fb 100%);
}
.uxp-css-demo-stage{
  padding-top:14px;
  padding-right:14px;
  padding-bottom:14px;
  padding-left:14px;
  border:1px dashed #c3d2e3;
  border-radius:12px;
  background:#ffffff;
}
.uxp-css-demo-stage[data-narrow="true"]{
  width:236px;
  max-width:100%;
}
.uxp-css-chip-row{
  display:flex;
  flex-wrap:wrap;
}
.uxp-css-chip{
  display:inline-flex;
  align-items:center;
  margin-top:0;
  margin-right:8px;
  margin-bottom:8px;
  margin-left:0;
  padding-top:7px;
  padding-right:10px;
  padding-bottom:7px;
  padding-left:10px;
  border:1px solid #c6d5e5;
  border-radius:999px;
  background:#edf4fb;
  color:#18334a;
  font-family:var(--app-font-family-base);
  font-size:12px;
  line-height:16px;
}
.uxp-css-chip:last-child{
  margin-right:0;
}
.uxp-css-chip-icon{
  width:18px;
  height:18px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  flex:0 0 auto;
  margin-top:0;
  margin-right:8px;
  margin-bottom:0;
  margin-left:0;
  border-radius:999px;
  background:#1b6aa7;
  color:#ffffff;
  font-family:var(--app-font-family-mono);
  font-size:10px;
  line-height:10px;
}
.uxp-css-label-stack{
  display:flex;
  flex-direction:column;
}
.uxp-css-form-row{
  display:flex;
  align-items:center;
  min-width:0;
}
.uxp-css-form-row > .uxp-css-field{
  margin-top:0;
  margin-right:12px;
  margin-bottom:0;
  margin-left:0;
}
.uxp-css-form-row > .uxp-css-field:last-child{
  margin-right:0;
}
.uxp-css-field{
  display:flex;
  flex-direction:column;
  min-width:0;
  flex:1 1 auto;
}
.uxp-css-control-label{
  display:inline-flex;
  align-items:center;
  flex-wrap:nowrap;
  min-width:0;
  margin-top:0;
  margin-right:0;
  margin-bottom:8px;
  margin-left:0;
  font-family:var(--app-font-family-base);
  font-size:12px;
  line-height:16px;
  color:#253547;
}
.uxp-css-control-label:last-child{
  margin-bottom:0;
}
.uxp-css-checkbox{
  width:16px;
  height:16px;
  flex:0 0 auto;
  margin-top:0;
  margin-right:8px;
  margin-bottom:0;
  margin-left:0;
}
.uxp-css-input{
  width:100%;
  min-height:34px;
  padding-top:8px;
  padding-right:10px;
  padding-bottom:8px;
  padding-left:10px;
  border:1px solid #bfd0e0;
  border-radius:10px;
  background:#ffffff;
  color:#162132;
  font-family:var(--app-font-family-base);
  font-size:12px;
  line-height:16px;
}
.uxp-css-input-wrap{
  display:flex;
  align-items:center;
  min-width:0;
}
.uxp-css-input-wrap > .uxp-css-input{
  margin-top:0;
  margin-right:10px;
  margin-bottom:0;
  margin-left:0;
}
.uxp-css-input-wrap > .uxp-css-metric:last-child{
  margin-right:0;
}
.uxp-css-metric{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  flex:0 0 auto;
  min-width:72px;
  min-height:34px;
  padding-top:0;
  padding-right:10px;
  padding-bottom:0;
  padding-left:10px;
  border:1px solid #bfd0e0;
  border-radius:10px;
  background:#f3f7fb;
  color:#35516e;
  font-family:var(--app-font-family-mono);
  font-size:11px;
  line-height:14px;
}
.uxp-css-inline-warning{
  display:inline;
  padding-top:4px;
  padding-right:6px;
  padding-bottom:4px;
  padding-left:6px;
  border:1px solid #cdd9e7;
  border-radius:8px;
  background:#eef4fa;
  color:#31465b;
  font-family:var(--app-font-family-base);
  font-size:12px;
  line-height:17px;
}
.uxp-css-inline-block{
  display:block;
  margin-top:12px;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
  padding-top:10px;
  padding-right:12px;
  padding-bottom:10px;
  padding-left:12px;
  border:1px solid #cbd8e6;
  border-radius:12px;
  background:#eef4fa;
  color:#31465b;
  font-family:var(--app-font-family-base);
  font-size:12px;
  line-height:17px;
}
.uxp-css-scoreboard{
  display:flex;
  flex-wrap:wrap;
}
.uxp-css-score{
  width:calc(33.333% - 8px);
  min-width:150px;
  margin-top:0;
  margin-right:12px;
  margin-bottom:12px;
  margin-left:0;
  padding-top:12px;
  padding-right:12px;
  padding-bottom:12px;
  padding-left:12px;
  border:1px solid #d7e1ed;
  border-radius:14px;
  background:#ffffff;
}
.uxp-css-score:nth-child(3n){
  margin-right:0;
}
.uxp-css-score-k{
  margin-top:0;
  margin-right:0;
  margin-bottom:6px;
  margin-left:0;
  font-family:var(--app-font-family-mono);
  font-size:10px;
  line-height:14px;
  text-transform:uppercase;
  letter-spacing:.04em;
  color:#67788a;
}
.uxp-css-score-v{
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
  font-family:var(--app-font-family-display);
  font-size:20px;
  line-height:22px;
  color:#162132;
}
.uxp-css-footer{
  padding-top:0;
  padding-right:20px;
  padding-bottom:24px;
  padding-left:20px;
}
.uxp-css-footer-note{
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
  padding-top:12px;
  padding-right:14px;
  padding-bottom:12px;
  padding-left:14px;
  border:1px solid #d4deea;
  border-radius:14px;
  background:rgba(244,248,252,.94);
  font-family:var(--app-font-family-base);
  font-size:12px;
  line-height:18px;
  color:#435466;
}
.uxp-css-provider-board{
  display:flex;
  flex-direction:column;
}
.uxp-css-provider-board > .settings-provider-row{
  margin-top:0;
  margin-right:0;
  margin-bottom:10px;
  margin-left:0;
}
.uxp-css-provider-board > .settings-provider-row:last-child{
  margin-bottom:0;
}
.uxp-css-provider-board .sec-lbl{
  margin-top:0;
  margin-right:0;
  margin-bottom:10px;
  margin-left:0;
}
.uxp-css-conversation-board{
  width:100%;
  min-width:0;
}
.uxp-css-composer-board{
  width:100%;
  min-width:0;
  border:1px solid var(--app-color-border-default);
  border-radius:16px;
  background:var(--app-color-background-layer-1);
  padding-top:12px;
  padding-right:12px;
  padding-bottom:12px;
  padding-left:12px;
}
.uxp-css-composer-board .cmp-attach-band{
  padding-bottom:8px;
}
.uxp-css-composer-board .cmp-chip-row{
  display:flex;
  flex-wrap:wrap;
  min-width:0;
}
.uxp-css-composer-board .cmp-chip{
  display:inline-flex;
  align-items:center;
  min-width:0;
  max-width:100%;
  margin-top:0;
  margin-right:8px;
  margin-bottom:8px;
  margin-left:0;
  padding-top:6px;
  padding-right:10px;
  padding-bottom:6px;
  padding-left:10px;
  border:1px solid var(--app-color-border-default);
  border-radius:999px;
  background:var(--app-color-background-layer-2);
}
.uxp-css-composer-board .cmp-chip:last-child{
  margin-right:0;
}
.uxp-css-composer-board .cmp-chip-name{
  min-width:0;
  font-family:var(--app-font-family-base);
  font-size:12px;
  line-height:16px;
  color:var(--app-color-text-primary);
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.uxp-css-composer-board .cmp-chip-remove{
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:8px;
}
.uxp-css-composer-board .cmp-body{
  border:1px solid var(--app-color-border-default);
  border-radius:14px;
  background:var(--app-color-background-elevated);
  padding-top:10px;
  padding-right:10px;
  padding-bottom:10px;
  padding-left:10px;
}
.uxp-css-composer-board .cmp-ta{
  min-height:72px;
}
.uxp-css-composer-board .send-wrap{
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:8px;
}
.uxp-css-compact-grid{
  display:flex;
  flex-wrap:wrap;
}
.uxp-css-compact-grid > .uxp-css-compact-case{
  width:calc(33.333% - 8px);
  min-width:220px;
  margin-top:0;
  margin-right:12px;
  margin-bottom:12px;
  margin-left:0;
}
.uxp-css-compact-grid > .uxp-css-compact-case:nth-child(3n){
  margin-right:0;
}
.uxp-css-compact-case{
  display:flex;
  flex-direction:column;
}
.uxp-css-compact-label{
  margin-top:0;
  margin-right:0;
  margin-bottom:8px;
  margin-left:0;
  font-family:var(--app-font-family-mono);
  font-size:10px;
  line-height:14px;
  text-transform:uppercase;
  letter-spacing:.04em;
  color:#66788a;
}
.uxp-css-panel-frame{
  border:1px solid #d7e1ed;
  border-radius:16px;
  background:#f7fbff;
  overflow:hidden;
}
.uxp-css-panel-frame .panel{
  min-width:0;
  height:100%;
  background:var(--app-color-background-base);
}
.uxp-css-compact-panel{
  width:100%;
  min-width:0;
  min-height:0;
}
.uxp-css-panel-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  min-width:0;
  padding-top:10px;
  padding-right:12px;
  padding-bottom:10px;
  padding-left:12px;
  border-bottom:1px solid var(--app-color-border-default);
  background:var(--app-color-background-layer-1);
}
.uxp-css-panel-title{
  min-width:0;
  font-family:var(--app-font-family-display);
  font-size:12px;
  line-height:16px;
  font-weight:600;
  color:var(--app-color-text-primary);
}
.uxp-css-panel-badge{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  flex:0 0 auto;
  min-height:20px;
  padding-top:0;
  padding-right:8px;
  padding-bottom:0;
  padding-left:8px;
  border:1px solid var(--app-color-border-default);
  border-radius:999px;
  background:var(--app-color-background-layer-2);
  color:var(--app-color-text-secondary);
  font-family:var(--app-font-family-mono);
  font-size:10px;
  line-height:14px;
}
.uxp-css-panel-body{
  display:flex;
  flex-direction:column;
  min-width:0;
  min-height:0;
  padding-top:10px;
  padding-right:10px;
  padding-bottom:10px;
  padding-left:10px;
}
.uxp-css-panel-body > *{
  margin-top:0;
  margin-right:0;
  margin-bottom:10px;
  margin-left:0;
}
.uxp-css-panel-body > *:last-child{
  margin-bottom:0;
}
.uxp-css-panel-body .uxp-css-composer-board{
  margin-top:auto;
}
.uxp-css-icon-grid{
  display:flex;
  flex-wrap:wrap;
}
.uxp-css-icon-grid > .uxp-css-icon-case{
  width:calc(50% - 6px);
  min-width:220px;
  margin-top:0;
  margin-right:12px;
  margin-bottom:12px;
  margin-left:0;
}
.uxp-css-icon-grid > .uxp-css-icon-case:nth-child(2n){
  margin-right:0;
}
.uxp-css-icon-case{
  display:flex;
  flex-direction:column;
  padding-top:12px;
  padding-right:12px;
  padding-bottom:12px;
  padding-left:12px;
  border:1px solid #d7e1ed;
  border-radius:14px;
  background:#ffffff;
}
.uxp-css-icon-case-title{
  margin-top:0;
  margin-right:0;
  margin-bottom:10px;
  margin-left:0;
  font-family:var(--app-font-family-base);
  font-size:12px;
  line-height:16px;
  font-weight:600;
  color:#213142;
}
.uxp-css-icon-row{
  display:flex;
  align-items:center;
  min-width:0;
}
.uxp-css-icon-row > *{
  margin-top:0;
  margin-right:10px;
  margin-bottom:0;
  margin-left:0;
}
.uxp-css-icon-row > *:last-child{
  margin-right:0;
}
.uxp-css-bad-button{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:34px;
  min-height:34px;
  padding-top:0;
  padding-right:10px;
  padding-bottom:0;
  padding-left:10px;
  border:1px solid var(--app-color-border-default);
  border-radius:10px;
  background:var(--app-color-background-layer-2);
  color:var(--app-color-text-secondary);
}
.uxp-css-bad-button-icon{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:16px;
  height:16px;
}
.uxp-css-plain-overlay-button{
  min-width:34px;
  min-height:34px;
  padding-top:0;
  padding-right:10px;
  padding-bottom:0;
  padding-left:10px;
  border:1px solid var(--app-color-border-default);
  border-radius:10px;
  background:var(--app-color-background-layer-2);
  color:var(--app-color-text-secondary);
}
.uxp-css-overlay-slot{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:16px;
  min-width:16px;
  height:16px;
}
.uxp-css-geometry{
  margin-top:10px;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
  font-family:var(--app-font-family-mono);
  font-size:10px;
  line-height:15px;
  color:#5f7285;
  white-space:pre-wrap;
}
@media (max-width: 920px){
  .uxp-css-harness-page-inner{
    padding-top:14px;
    padding-right:14px;
    padding-bottom:24px;
    padding-left:14px;
  }
  .uxp-css-grid{
    padding-top:14px;
    padding-right:14px;
    padding-bottom:0;
    padding-left:14px;
  }
  .uxp-css-card{
    width:100%;
    margin-right:0;
  }
  .uxp-css-score{
    width:calc(50% - 6px);
  }
  .uxp-css-score:nth-child(3n){
    margin-right:12px;
  }
  .uxp-css-score:nth-child(2n){
    margin-right:0;
  }
  .uxp-css-compact-grid > .uxp-css-compact-case{
    width:calc(50% - 6px);
  }
  .uxp-css-compact-grid > .uxp-css-compact-case:nth-child(3n){
    margin-right:12px;
  }
  .uxp-css-compact-grid > .uxp-css-compact-case:nth-child(2n){
    margin-right:0;
  }
}
@media (max-width: 620px){
  .uxp-css-hero-title{
    font-size:23px;
    line-height:27px;
  }
  .uxp-css-form-row{
    flex-direction:column;
    align-items:stretch;
  }
  .uxp-css-form-row > .uxp-css-field{
    margin-top:0;
    margin-right:0;
    margin-bottom:12px;
    margin-left:0;
  }
  .uxp-css-form-row > .uxp-css-field:last-child{
    margin-bottom:0;
  }
  .uxp-css-score{
    width:100%;
    margin-right:0;
  }
  .uxp-css-compact-grid > .uxp-css-compact-case,
  .uxp-css-icon-grid > .uxp-css-icon-case{
    width:100%;
    margin-right:0;
  }
}
`;

function classifyPanelWidthMode(width: number): HarnessPanelWidthMode {
  if (width <= PANEL_COMPACT_MAX_WIDTH) {
    return 'compact';
  }
  if (width >= PANEL_WIDE_MIN_WIDTH) {
    return 'wide';
  }
  return 'regular';
}

function classifyPanelHeightMode(height: number): HarnessPanelHeightMode {
  return height <= PANEL_SHORT_MAX_HEIGHT ? 'short' : 'normal';
}

function useHarnessPanelResponsiveAttributes(panelRef: React.RefObject<HTMLDivElement | null>): void {
  const latestModesRef = useRef('');

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return undefined;
    }

    const applyModes = (width: number, height: number) => {
      const widthMode = classifyPanelWidthMode(width);
      const heightMode = classifyPanelHeightMode(height);
      const nextKey = `${widthMode}:${heightMode}`;
      if (latestModesRef.current === nextKey) {
        return;
      }
      latestModesRef.current = nextKey;
      panel.dataset.panelWidthMode = widthMode;
      panel.dataset.panelHeightMode = heightMode;
    };

    const rect = panel.getBoundingClientRect();
    applyModes(rect.width, rect.height);

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        delete panel.dataset.panelWidthMode;
        delete panel.dataset.panelHeightMode;
        latestModesRef.current = '';
      };
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) {
        return;
      }
      applyModes(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(panel);

    return () => {
      observer.disconnect();
      delete panel.dataset.panelWidthMode;
      delete panel.dataset.panelHeightMode;
      latestModesRef.current = '';
    };
  }, [panelRef]);
}

function measureRuntimeInfo(
  panel: HTMLDivElement | null,
  scroll: HTMLDivElement | null,
): string {
  if (!panel || !scroll) {
    return 'panel=missing\nscroll=missing';
  }
  const panelStyle = window.getComputedStyle(panel);
  const scrollStyle = window.getComputedStyle(scroll);
  const parent = panel.parentElement;
  return [
    `panel.tag=${panel.tagName.toLowerCase()}`,
    `panel.parent=${parent?.tagName.toLowerCase() ?? 'none'}`,
    `panel.height=${panel.clientHeight}`,
    `panel.width=${panel.clientWidth}`,
    `panel.mode=${panel.dataset.panelWidthMode ?? '?'} / ${panel.dataset.panelHeightMode ?? '?'}`,
    `panel.overflow=${panelStyle.overflowY}/${panelStyle.overflowX}`,
    `scroll.height=${scroll.clientHeight}`,
    `scroll.scrollHeight=${scroll.scrollHeight}`,
    `scroll.top=${scroll.scrollTop}`,
    `scroll.overflowY=${scrollStyle.overflowY}`,
  ].join('\n');
}

type StatusTone = 'pass' | 'check' | 'fail';

interface ScenarioCardProps {
  readonly category: string;
  readonly title: string;
  readonly tone: StatusTone;
  readonly summary: string;
  readonly rules: readonly { readonly text: string; readonly bad?: boolean }[];
  readonly checks: readonly string[];
  readonly children: React.ReactNode;
}

function ensureHarnessStyles(): void {
  const styleId = 'imagen-ps-uxp-css-contract-harness-styles';
  if (typeof document === 'undefined' || document.getElementById(styleId)) {
    return;
  }
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `${PANEL_CSS}\n${HARNESS_CSS}`;
  document.head.appendChild(style);
}

function StatusBadge({ tone }: { readonly tone: StatusTone }) {
  return <span className="uxp-css-status" data-tone={tone}>{tone}</span>;
}

function ScenarioCard({
  category,
  title,
  tone,
  summary,
  rules,
  checks,
  children,
}: ScenarioCardProps) {
  return (
    <section className="uxp-css-card">
      <div className="uxp-css-card-head">
        <div className="uxp-css-card-top">
          <div className="uxp-css-card-title-wrap">
            <h2 className="uxp-css-card-title">{title}</h2>
            <p className="uxp-css-card-subtitle">{category}</p>
          </div>
          <StatusBadge tone={tone} />
        </div>
        <p className="uxp-css-card-copy">{summary}</p>
      </div>
      <div className="uxp-css-card-body">
        <div className="uxp-css-rule-list">
          {rules.map((rule) => (
            <span key={rule.text} className="uxp-css-rule" data-tone={rule.bad ? 'bad' : undefined}>
              {rule.text}
            </span>
          ))}
        </div>
        <div className="uxp-css-eval">
          <p className="uxp-css-eval-label">What To Check In Photoshop</p>
          <ul className="uxp-css-eval-list">
            {checks.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div className="uxp-css-demo">
          <p className="uxp-css-eval-label">Live specimen</p>
          {children}
        </div>
      </div>
    </section>
  );
}

function geometryLabel(element: HTMLElement | null): string {
  if (!element) {
    return 'missing';
  }
  const rect = element.getBoundingClientRect();
  return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
}

function ProviderSettingsBoard() {
  return (
    <div className="uxp-css-provider-board">
      <div className="sec-lbl">Configured</div>
      <div
        data-testid="harness-global-generation-row"
        className="prov-row settings-provider-row is-special"
        role="button"
        tabIndex={0}
      >
        <div className="prov-leading">
          <div className="prov-ico" style={{ background: 'var(--app-color-accent-subtle)', color: 'var(--app-color-accent-default)' }}>
            <Icon name="settings" size={14} />
          </div>
        </div>
        <div className="prov-content">
          <div className="prov-title-row">
            <span className="prov-name">Global Generation</span>
          </div>
          <div className="prov-meta-row">
            <span className="prov-family">LARGE · PNG · auto</span>
          </div>
        </div>
        <div className="prov-end">
          <div className="prov-trail"><Icon name="chevron-right" /></div>
        </div>
      </div>
      <div
        data-testid="harness-provider-row"
        className="prov-row settings-provider-row is-enabled"
        role="button"
        tabIndex={0}
      >
        <div className="prov-leading">
          <div className="prov-ico">
            OA
          </div>
        </div>
        <div className="prov-content">
          <div className="prov-title-row">
            <span className="prov-name">OpenAI Main Profile</span>
          </div>
          <div className="prov-meta-row">
            <span className="prov-family">image-endpoint</span>
            <span className="prov-meta-sep" aria-hidden="true">•</span>
            <span className="prov-model">gpt-image-1</span>
          </div>
        </div>
        <div className="prov-end">
          <div className="prov-readiness ready" aria-label="Ready">
            <span className="prov-readiness-dot" aria-hidden="true" />
            <span className="prov-status-text">Ready</span>
          </div>
          <div className="prov-trail"><Icon name="chevron-right" /></div>
        </div>
      </div>
    </div>
  );
}

function ComposerConversationBoard({
  promptText,
  onPromptText,
}: {
  readonly promptText: string;
  readonly onPromptText: (value: string) => void;
}) {
  return (
    <div className="uxp-css-conversation-board">
      <div className="round-item round-item-complete" data-round-id="harness-round">
        <div className="msg-prov msg-prov-surface" style={{ marginTop: 4 }}>
          <div className="prov-card prov-card-text-only">
            <div className="prov-top">
              <ProviderIdentity
                providerName="OpenAI"
                providerId="openai"
                modelId="gpt-image-1"
                modelLabel="gpt-image-1"
              />
              <div className="prov-status">
                <span className="sdot ok" />
                <span className="prov-status-text ok">Done · 4s</span>
              </div>
            </div>
            <div className="prov-response">
              <div className="prov-response-text">
                Provider response text specimen. This block should stay readable, not collide with the copy button, and wrap without breaking the card rhythm.
              </div>
              <div className="prov-response-actions">
                <IconButton
                  className="prov-response-copy"
                  quiet
                  icon={<Icon name="copy" />}
                  tooltip="Copy response"
                />
              </div>
            </div>
            <div className="prov-actions">
              <IconButton
                className="act-ico act-download"
                hostClassName="act-download-host"
                quiet
                icon={<Icon name="download" />}
                tooltip="Download"
              />
            </div>
          </div>
        </div>
      </div>
      <div className="uxp-css-composer-board">
        <div className="cmp-attach-band">
          <div className="cmp-chip-row">
            <div className="cmp-chip">
              <span className="cmp-chip-name">capture-layer-selection.png</span>
              <IconButton
                className="cmp-chip-remove"
                quiet
                icon={<Icon name="close" size={12} />}
                tooltip="Remove attachment"
                iconSize={12}
              />
            </div>
          </div>
        </div>
        <div className="cmp-core">
          <div className="cmp-body">
            <TextField
              className="cmp-ta"
              value={promptText}
              onValue={onPromptText}
            />
          </div>
          <div className="cmp-action-row" data-testid="harness-composer-action-row">
            <div className="cmp-action-left">
              <IconButton
                className="cmp-opt-icon-button"
                quiet
                icon={<Icon name="magic-wand" size={13} className="cmp-opt-icon" />}
                tooltip="Optimize prompt"
                placement="top"
                iconSize={13}
              />
            </div>
            <div className="cmp-action-right">
              <IconButton
                className="cmp-capture"
                hostClassName="cmp-capture-host"
                icon={<Icon name="target" size={13} className="cmp-capture-icon" />}
                tooltip="Capture from Photoshop"
                aria-label="Capture from Photoshop"
                placement="top"
                iconSize={13}
              />
              <div className="send-wrap">
                <Button className="img-act prim" variant="accent">
                  Send
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconGeometrySpecimen() {
  const badIconRef = useRef<HTMLSpanElement | null>(null);
  const overlayHostRef = useRef<HTMLButtonElement | null>(null);
  const overlayIconRef = useRef<HTMLSpanElement | null>(null);
  const [snapshot, setSnapshot] = useState({
    badIcon: 'pending',
    overlayHost: 'pending',
    overlayIcon: 'pending',
  });

  useEffect(() => {
    const update = () => {
      setSnapshot({
        badIcon: geometryLabel(badIconRef.current),
        overlayHost: geometryLabel(overlayHostRef.current),
        overlayIcon: geometryLabel(overlayIconRef.current),
      });
    };
    update();
    const timer = window.setInterval(update, 400);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="uxp-css-icon-grid">
      <div className="uxp-css-icon-case">
        <p className="uxp-css-icon-case-title">Risky inline SVG in a plain button</p>
        <div className="uxp-css-icon-row">
          <button type="button" className="uxp-css-bad-button" aria-label="Plain inline icon button">
            <span ref={badIconRef} className="uxp-css-bad-button-icon">
              <Icon name="settings" size={16} />
            </span>
          </button>
          <span className="uxp-css-inline-warning">Expected risk: icon may render but report `0x0` in Photoshop.</span>
        </div>
        <p className="uxp-css-geometry">inline icon rect: {snapshot.badIcon}</p>
      </div>
      <div className="uxp-css-icon-case">
        <p className="uxp-css-icon-case-title">Repo-safe overlay shell button</p>
        <div className="uxp-css-icon-row">
          <OverlayControlShell
            hostClassName="ui-icon-button-host"
            overlayClassName="ui-icon-button-overlay"
            overlay={(
              <span ref={overlayIconRef}>
                <Icon name="settings" size={16} />
              </span>
            )}
            style={{ '--ui-icon-button-size': '16px' } as React.CSSProperties}
          >
            <button ref={overlayHostRef} type="button" className="uxp-css-plain-overlay-button">
              <span className="uxp-css-overlay-slot" aria-hidden="true" />
            </button>
          </OverlayControlShell>
          <span className="uxp-css-inline-block">Expected safe path: host and overlay icon should both keep non-zero geometry.</span>
        </div>
        <p className="uxp-css-geometry">
          overlay host rect: {snapshot.overlayHost}
          {'\n'}
          overlay icon rect: {snapshot.overlayIcon}
        </p>
      </div>
    </div>
  );
}

export function UxpCssContractHarnessPage() {
  const [promptText, setPromptText] = useState('Extend the captured background with soft film-grain texture while preserving the subject silhouette and the layer placement context.');
  const panelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [runtimeInfo, setRuntimeInfo] = useState('panel=booting\nscroll=booting');

  useEffect(() => {
    ensureHarnessStyles();
  }, []);

  useHarnessPanelResponsiveAttributes(panelRef);

  useEffect(() => {
    const update = () => {
      setRuntimeInfo(measureRuntimeInfo(panelRef.current, scrollRef.current));
    };
    update();
    const scroll = scrollRef.current;
    scroll?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    const timer = window.setInterval(update, 600);
    return () => {
      scroll?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div ref={panelRef} className="panel uxp-css-harness-root" data-testid="uxp-css-contract-panel">
      <div className="uxp-css-harness-page">
        <div ref={scrollRef} className="scroll uxp-css-harness-scroll" data-testid="uxp-css-contract-scroll">
          <div className="uxp-css-harness-page-inner">
            <div className="uxp-css-harness-shell">
              <section className="uxp-css-hero">
            <div className="uxp-css-hero-head">
              <p className="uxp-css-eyebrow">Photoshop UXP CSS Contract Harness</p>
              <h1 className="uxp-css-hero-title">One page. One glance. One decision.</h1>
              <p className="uxp-css-hero-copy">
                Each card shows one UXP CSS contract target, the expected safe pattern, and a live specimen to inspect in Chrome and real Photoshop.
                Green means repo-approved pattern. Yellow means manual host check still matters. Red marks the pattern this harness is explicitly replacing.
              </p>
              <p className="uxp-css-runtime-note" data-testid="uxp-css-contract-runtime-info">{runtimeInfo}</p>
            </div>
            <div className="uxp-css-legend">
              <span className="uxp-css-legend-item"><span className="uxp-css-legend-dot" data-tone="pass" />repo-safe pattern</span>
              <span className="uxp-css-legend-item"><span className="uxp-css-legend-dot" data-tone="check" />needs real host eyes</span>
              <span className="uxp-css-legend-item"><span className="uxp-css-legend-dot" data-tone="fail" />pattern to avoid</span>
            </div>
            <div className="uxp-css-grid">
              <ScenarioCard
                category="inline-flex"
                title="Single-line chip / badge shell"
                tone="pass"
                summary="Verifies the repo-safe `inline-flex + explicit margins + center alignment` pattern used for compact UI atoms."
                rules={[
                  { text: 'display:inline-flex' },
                  { text: 'align-items:center' },
                  { text: 'explicit margins' },
                  { text: 'gap not used', bad: true },
                ]}
                checks={[
                  'Icon and text stay vertically centered.',
                  'Spacing between chips comes from margins, not implicit flex gap.',
                  'No chip collapses when the panel width gets narrow.',
                ]}
              >
                <div className="uxp-css-demo-stage">
                  <div className="uxp-css-chip-row">
                    <span className="uxp-css-chip"><span className="uxp-css-chip-icon">M</span>Mock Provider</span>
                    <span className="uxp-css-chip"><span className="uxp-css-chip-icon">L</span>Layer Ready</span>
                    <span className="uxp-css-chip"><span className="uxp-css-chip-icon">1</span>1024px</span>
                  </div>
                </div>
              </ScenarioCard>
              <ScenarioCard
                category="label semantics"
                title="Label + control no-wrap contract"
                tone="check"
                summary="Verifies the known UXP `<label>` caveat: use `inline-flex` semantics safely by forcing `flex-wrap:nowrap` and checking real host layout."
                rules={[
                  { text: 'label inline-flex' },
                  { text: 'flex-wrap:nowrap' },
                  { text: 'baseline avoided', bad: true },
                ]}
                checks={[
                  'Checkbox and label text stay on one row.',
                  'Long label does not wrap under the checkbox in Photoshop.',
                  'No baseline wobble appears between checkbox and text.',
                ]}
              >
                <div className="uxp-css-demo-stage">
                  <div className="uxp-css-label-stack">
                    <label className="uxp-css-control-label">
                      <input className="uxp-css-checkbox" type="checkbox" defaultChecked />
                      Keep provider output in the source document without frame transform
                    </label>
                    <label className="uxp-css-control-label">
                      <input className="uxp-css-checkbox" type="checkbox" />
                      Use explicit document-only fallback when exact-frame is not safe
                    </label>
                  </div>
                </div>
              </ScenarioCard>
              <ScenarioCard
                category="narrow panel stress"
                title="Narrow row with min-width:0"
                tone="check"
                summary="Verifies the panel pattern most likely to regress in Photoshop: a text input row with a trailing metric pill under compact width."
                rules={[
                  { text: 'display:flex' },
                  { text: 'min-width:0' },
                  { text: 'justify-content:flex-start' },
                  { text: 'space-evenly avoided', bad: true },
                ]}
                checks={[
                  'Input shrinks before overflowing the container.',
                  'Trailing metric pill remains visible and aligned.',
                  'No unexpected horizontal clipping in the narrow frame.',
                ]}
              >
                <div className="uxp-css-demo-stage" data-narrow="true">
                  <div className="uxp-css-input-wrap">
                    <input className="uxp-css-input" defaultValue="A long prompt fragment that should shrink instead of breaking layout" />
                    <span className="uxp-css-metric">2048px</span>
                  </div>
                </div>
              </ScenarioCard>
              <ScenarioCard
                category="inline text warning"
                title="Inline text vs block surface"
                tone="fail"
                summary="Shows the exact failure class called out in Adobe known issues: inline text background is the risky specimen; block wrapper is the safe fallback."
                rules={[
                  { text: 'inline text wraps', bad: true },
                  { text: 'background on block wrapper' },
                  { text: 'border on block wrapper' },
                ]}
                checks={[
                  'If the inline specimen wraps in Photoshop, its background may only paint the first line.',
                  'The block specimen below should keep its border and background around the whole message.',
                  'Use this card to explain why certain notices must stay block-level.',
                ]}
              >
                <div className="uxp-css-demo-stage" data-narrow="true">
                  <span className="uxp-css-inline-warning">
                    Inline warning specimen. If this wraps across multiple lines in Photoshop, the background may not cover the later lines cleanly.
                  </span>
                  <span className="uxp-css-inline-block">
                    Block warning specimen. This wrapper should keep the border and background around the full message even when the text becomes multi-line.
                  </span>
                </div>
              </ScenarioCard>
              <ScenarioCard
                category="real page specimen"
                title="Provider row / settings row"
                tone="check"
                summary="Uses the real settings-page row structure and classes so you can inspect provider-row alignment, status wrapping, and trailing action stability under UXP host layout."
                rules={[
                  { text: 'prov-row / prov-title-row' },
                  { text: 'prov-end stays visible' },
                  { text: 'label + status wrap safely' },
                ]}
                checks={[
                  'Provider name, family, model, and readiness dot stay aligned.',
                  'The trailing chevron remains visible instead of collapsing.',
                  'On narrow width, title/meta may wrap but the row should still read cleanly.',
                ]}
              >
                <div className="uxp-css-demo-stage">
                  <ProviderSettingsBoard />
                </div>
              </ScenarioCard>
              <ScenarioCard
                category="real page specimen"
                title="Conversation card / composer bottom row"
                tone="check"
                summary="Uses the real conversation-card and composer-action-row structure so Photoshop can reveal host-only shrink, wrap, and icon overlay issues in the app’s hottest surface."
                rules={[
                  { text: 'prov-card / prov-top' },
                  { text: 'cmp-action-left / right' },
                  { text: 'icon overlays stay visible' },
                  { text: 'baseline not relied on', bad: true },
                ]}
                checks={[
                  'Provider identity, status chip, and action icons remain readable.',
                  'Conversation response text and result actions do not overlap.',
                  'Composer bottom row keeps left and right groups separated under narrow width.',
                ]}
              >
                <div className="uxp-css-demo-stage">
                  <ComposerConversationBoard promptText={promptText} onPromptText={setPromptText} />
                </div>
              </ScenarioCard>
              <ScenarioCard
                category="host-only geometry"
                title="Icon 0x0 / overlay shell"
                tone="check"
                summary="This is the Photoshop-only icon geometry trap: compare a plain inline SVG button against the repo-safe overlay shell pattern and watch the live rect readout."
                rules={[
                  { text: 'plain inline SVG can collapse', bad: true },
                  { text: 'overlay sibling icon shell' },
                  { text: 'non-zero geometry required' },
                ]}
                checks={[
                  'If the plain inline icon reports 0x0 in Photoshop, that confirms the host-only collapse path.',
                  'Overlay host and overlay icon should keep non-zero geometry.',
                  'Use this card before blaming CSS color, spacing, or icon asset mapping.',
                ]}
              >
                <div className="uxp-css-demo-stage">
                  <IconGeometrySpecimen />
                </div>
              </ScenarioCard>
              <ScenarioCard
                category="responsive contract"
                title="Compact width responsive breakpoints"
                tone="check"
                summary="Renders the same real app specimen under the panel's compact, regular, and wide width modes so you can catch mode-specific regressions instead of eyeballing one arbitrary width."
                rules={[
                  { text: 'data-panel-width-mode=compact' },
                  { text: 'data-panel-width-mode=regular' },
                  { text: 'data-panel-width-mode=wide' },
                ]}
                checks={[
                  'Compact mode should stack and wrap intentionally, not clip.',
                  'Regular mode should preserve the default reading order and spacing.',
                  'Wide mode should expand without creating awkward empty zones or oversize actions.',
                ]}
              >
                <div className="uxp-css-demo-stage">
                  <div className="uxp-css-compact-grid">
                    <div className="uxp-css-compact-case">
                      <p className="uxp-css-compact-label">compact · 300px</p>
                      <div className="uxp-css-panel-frame">
                        <div className="panel uxp-css-compact-panel" data-panel-width-mode="compact">
                          <div className="uxp-css-panel-head">
                            <span className="uxp-css-panel-title">Imagen</span>
                            <span className="uxp-css-panel-badge">compact</span>
                          </div>
                          <div className="uxp-css-panel-body">
                            <ProviderSettingsBoard />
                            <ComposerConversationBoard promptText={promptText} onPromptText={setPromptText} />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="uxp-css-compact-case">
                      <p className="uxp-css-compact-label">regular · 360px</p>
                      <div className="uxp-css-panel-frame">
                        <div className="panel uxp-css-compact-panel" data-panel-width-mode="regular">
                          <div className="uxp-css-panel-head">
                            <span className="uxp-css-panel-title">Imagen</span>
                            <span className="uxp-css-panel-badge">regular</span>
                          </div>
                          <div className="uxp-css-panel-body">
                            <ProviderSettingsBoard />
                            <ComposerConversationBoard promptText={promptText} onPromptText={setPromptText} />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="uxp-css-compact-case">
                      <p className="uxp-css-compact-label">wide · 600px</p>
                      <div className="uxp-css-panel-frame">
                        <div className="panel uxp-css-compact-panel" data-panel-width-mode="wide">
                          <div className="uxp-css-panel-head">
                            <span className="uxp-css-panel-title">Imagen</span>
                            <span className="uxp-css-panel-badge">wide</span>
                          </div>
                          <div className="uxp-css-panel-body">
                            <ProviderSettingsBoard />
                            <ComposerConversationBoard promptText={promptText} onPromptText={setPromptText} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </ScenarioCard>
            </div>
            <div className="uxp-css-footer">
              <div className="uxp-css-scoreboard">
                <div className="uxp-css-score">
                  <p className="uxp-css-score-k">Primary goal</p>
                  <p className="uxp-css-score-v">Visual contract proof</p>
                </div>
                <div className="uxp-css-score">
                  <p className="uxp-css-score-k">Good screenshot</p>
                  <p className="uxp-css-score-v">All eight cards readable</p>
                </div>
                <div className="uxp-css-score">
                  <p className="uxp-css-score-k">Open URL</p>
                  <p className="uxp-css-score-v">`?harness=uxp-css-contract`</p>
                </div>
              </div>
              <p className="uxp-css-footer-note">
                Decision rule: if a green card looks wrong in Photoshop, treat it as a repo bug. If a yellow card looks wrong only in Photoshop, capture host evidence and tighten the safe pattern. Red is not a pass target; it exists only to visualize the failure mode we are avoiding.
              </p>
            </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
