"use strict";var LowHighShell=(()=>{var T=Object.defineProperty;var z=Object.getOwnPropertyDescriptor;var D=Object.getOwnPropertyNames;var H=Object.prototype.hasOwnProperty;var P=(a,s)=>{for(var e in s)T(a,e,{get:s[e],enumerable:!0})},I=(a,s,e,t)=>{if(s&&typeof s=="object"||typeof s=="function")for(let i of D(s))!H.call(a,i)&&i!==e&&T(a,i,{get:()=>s[i],enumerable:!(t=z(s,i))||t.enumerable});return a};var O=a=>I(T({},"__esModule",{value:!0}),a);var V={};P(V,{LowHighLauncher:()=>x,LowHighSupport:()=>k});var w=`
:host {
    --lhs-bg: var(--lhs-bg-override, #101014);
    --lhs-surface: var(--lhs-surface-override, rgba(255, 255, 255, 0.05));
    --lhs-border: var(--lhs-border-override, rgba(255, 255, 255, 0.1));
    --lhs-text: var(--lhs-text-override, #f4f4f5);
    --lhs-muted: var(--lhs-muted-override, #9b9ba3);
    --lhs-accent: var(--lhs-accent-override, #fec43d);
    --lhs-accent-contrast: var(--lhs-accent-contrast-override, #111111);
    --lhs-radius: var(--lhs-radius-override, 14px);
    --lhs-z: var(--lhs-z-override, 2000);
    font-family: var(--lhs-font-override, inherit);
    color: var(--lhs-text);
    box-sizing: border-box;
}
*, *::before, *::after { box-sizing: inherit; }
button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; padding: 0; }
input, textarea, select { font: inherit; }
[hidden] { display: none !important; }

.spinner {
    width: 16px; height: 16px; border-radius: 50%;
    border: 2px solid var(--lhs-accent); border-top-color: transparent;
    animation: lhs-spin 0.7s linear infinite; margin: 0 auto;
}
@keyframes lhs-spin { to { transform: rotate(360deg); } }

.error-note {
    padding: 10px 12px; border-radius: 10px; font-size: 13px; line-height: 1.4;
    background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f2b8b5;
}

.badge {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 10.5px; font-weight: 600; letter-spacing: 0.02em;
    padding: 2px 7px; border-radius: 999px; white-space: nowrap;
}
.badge.soon {
    color: var(--lhs-muted);
    background: var(--lhs-surface);
    border: 1px solid var(--lhs-border);
}
`;function q(a,s){var e,t,i,r,o,l;return a===s?!0:!a||!s?!1:a.supabaseUrl===s.supabaseUrl&&a.supabaseAnonKey===s.supabaseAnonKey&&((e=a.accessToken)!=null?e:null)===((t=s.accessToken)!=null?t:null)&&((i=a.userId)!=null?i:null)===((r=s.userId)!=null?r:null)&&a.appSlug===s.appSlug&&((o=a.hubUrl)!=null?o:null)===((l=s.hubUrl)!=null?l:null)}var g=class extends HTMLElement{constructor(){super();this._config=null;this.renderQueued=!1;this.root=this.attachShadow({mode:"open"})}get config(){return this._config}set config(e){let t=this._config;this._config=e,q(t,e)||this.scheduleRender()}scheduleRender(){this.renderQueued||(this.renderQueued=!0,queueMicrotask(()=>{this.renderQueued=!1,this.isConnected&&this.render()}))}connectedCallback(){if(Object.prototype.hasOwnProperty.call(this,"config")){let e=this.config;delete this.config,this.config=e}this.render()}qs(e){return this.root.querySelector(e)}qsa(e){return Array.from(this.root.querySelectorAll(e))}};async function p(a,s,e){let t=await fetch(`${a.supabaseUrl.replace(/\/$/,"")}/rest/v1/${s}`,{...e,headers:{apikey:a.supabaseAnonKey,Authorization:`Bearer ${a.accessToken||a.supabaseAnonKey}`,"Content-Type":"application/json",...(e==null?void 0:e.headers)||{}}});if(!t.ok){let i=`Request failed (${t.status})`;try{let r=await t.json();i=r.message||r.error||i}catch{}throw new Error(i)}if(t.status!==204)return await t.json()}function n(a){return String(a!=null?a:"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function v(a){let s=new Date(a);return Number.isNaN(s.getTime())?"":s.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}var B="slug,name,short_description,icon_url,url,category,included_in_plans,status,featured,featured_copy,popularity,manual_order",N=5*60*1e3,S="lowhigh-shell:catalog:v1",h=null,b=null;function j(a){try{if(typeof localStorage=="undefined")return null;let s=localStorage.getItem(S);if(!s)return null;let e=JSON.parse(s);return!e||e.key!==a||!Array.isArray(e.apps)?null:e.apps}catch{return null}}function K(a,s){try{if(typeof localStorage=="undefined")return;localStorage.setItem(S,JSON.stringify({key:a,at:Date.now(),apps:s}))}catch{}}function $(a){let s=a.supabaseUrl;if(h&&h.key===s)return h.apps;let e=j(s);return e?(h={key:s,at:0,apps:e},e):null}async function A(a){let s=a.supabaseUrl,e=Date.now();return h&&h.key===s&&e-h.at<N?h.apps:b||(b=p(a,`app_catalog?select=${B}`).then(t=>(h={key:s,at:Date.now(),apps:t},K(s,t),t)).finally(()=>{b=null}),b)}function L(a,s){return a.filter(e=>e.status!=="hidden"&&e.status!=="deprecated").sort((e,t)=>{var i,r;return+(t.slug===s)-+(e.slug===s)||((i=e.manual_order)!=null?i:Number.MAX_SAFE_INTEGER)-((r=t.manual_order)!=null?r:Number.MAX_SAFE_INTEGER)||t.popularity-e.popularity||e.name.localeCompare(t.name)})}var U=`${w}
:host { position: relative; display: inline-block; }

.trigger {
    width: 36px; height: 36px; border-radius: 12px;
    display: inline-flex; align-items: center; justify-content: center;
    color: var(--lhs-muted); transition: background 0.15s ease, color 0.15s ease;
}
.trigger:hover, .trigger[aria-expanded="true"] { background: var(--lhs-surface); color: var(--lhs-accent); }
.trigger:focus-visible { outline: 2px solid var(--lhs-accent); outline-offset: 2px; }

.panel {
    position: absolute; top: calc(100% + 10px); right: 0; z-index: var(--lhs-z);
    width: min(340px, 92vw);
    background: var(--lhs-bg); border: 1px solid var(--lhs-border);
    border-radius: var(--lhs-radius);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
    overflow: hidden;
}
.panel-head {
    display: flex; align-items: center; gap: 8px;
    padding: 11px 14px; text-decoration: none;
    font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--lhs-muted); border-bottom: 1px solid var(--lhs-border);
    transition: color 0.12s ease;
}
a.panel-head:hover, a.panel-head:focus-visible { color: var(--lhs-text); outline: none; }
.head-logo {
    width: 18px; height: 18px; border-radius: 5px; flex-shrink: 0; object-fit: contain;
}
.apps { max-height: min(58vh, 420px); overflow-y: auto; padding: 6px; }
.app {
    display: flex; align-items: center; gap: 11px; width: 100%; text-align: left;
    padding: 10px; border-radius: 11px; text-decoration: none; color: inherit;
    transition: background 0.12s ease;
}
a.app:hover, a.app:focus-visible { background: var(--lhs-surface); outline: none; }
.app.disabled { cursor: default; opacity: 0.75; }
/* Current app: a non-clickable "you are here" marker, not a destination. */
.app.current { cursor: default; background: var(--lhs-surface); }
.app-icon {
    width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    background: var(--lhs-surface); border: 1px solid var(--lhs-border);
    font-weight: 700; font-size: 15px; color: var(--lhs-accent);
    overflow: hidden;
}
/* contain (not cover) + padding so a real logo is centered and never cropped,
   regardless of the source aspect ratio or built-in margins. */
.app-icon img { width: 100%; height: 100%; object-fit: contain; padding: 3px; }
.app-main { flex: 1; min-width: 0; }
.app-name-row { display: flex; align-items: center; gap: 7px; }
.app-name { font-size: 14px; font-weight: 600; color: var(--lhs-text); }
.app-desc {
    font-size: 12px; color: var(--lhs-muted); line-height: 1.35; margin-top: 1px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.current-tag { font-size: 10.5px; font-weight: 600; color: var(--lhs-muted); }
.state { padding: 22px 14px; text-align: center; font-size: 13px; color: var(--lhs-muted); }
`,G="https://www.lowhigh.ai/logo.png",W=`
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <circle cx="5" cy="5" r="1.6"/><circle cx="12" cy="5" r="1.6"/><circle cx="19" cy="5" r="1.6"/>
    <circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>
    <circle cx="5" cy="19" r="1.6"/><circle cx="12" cy="19" r="1.6"/><circle cx="19" cy="19" r="1.6"/>
</svg>`,x=class extends g{constructor(){super(...arguments);this.open=!1;this.loading=!1;this.loadError=null;this.apps=null;this.warmed=!1;this.onDocPointerDown=e=>{this.open&&(e.composedPath().includes(this)||this.toggle(!1))};this.onDocKeyDown=e=>{var t;this.open&&e.key==="Escape"&&(this.toggle(!1),(t=this.qs(".trigger"))==null||t.focus())}}connectedCallback(){super.connectedCallback(),document.addEventListener("pointerdown",this.onDocPointerDown),document.addEventListener("keydown",this.onDocKeyDown)}disconnectedCallback(){document.removeEventListener("pointerdown",this.onDocPointerDown),document.removeEventListener("keydown",this.onDocKeyDown)}toggle(e){this.open!==e&&(this.open=e,e&&!this.apps&&!this.loading&&this.load(),this.scheduleRender())}async load(){let e=this.config;if(e){this.loading=!0,this.loadError=null,this.scheduleRender();try{this.apps=await A(e)}catch(t){this.loadError=t instanceof Error?t.message:"Could not load apps",console.error("[lowhigh-launcher] catalog fetch failed:",t)}finally{this.loading=!1,this.scheduleRender()}}}render(){var t,i;let e=this.config;e&&!this.warmed&&(this.warmed=!0,this.apps||(this.apps=$(e)),this.load()),this.root.innerHTML=`
            <style>${U}</style>
            <button class="trigger" type="button" aria-haspopup="dialog"
                aria-expanded="${this.open}" aria-label="LowHigh apps" title="LowHigh apps">
                ${W}
            </button>
            ${this.open?this.renderPanel((t=e==null?void 0:e.appSlug)!=null?t:"",(e==null?void 0:e.hubUrl)||"https://www.lowhigh.ai"):""}
        `,(i=this.qs(".trigger"))==null||i.addEventListener("click",()=>this.toggle(!this.open))}renderPanel(e,t){let i;return this.apps&&this.apps.length>0?i=`<div class="apps" role="list">${L(this.apps,e).map(o=>this.renderApp(o,e)).join("")}</div>`:this.loading?i='<div class="state"><div class="spinner"></div></div>':this.loadError?i='<div class="state">Apps are unavailable right now. Please try again shortly.</div>':i='<div class="state">No apps to show yet.</div>',`
            <div class="panel" role="dialog" aria-label="More from LowHigh">
                <a class="panel-head" href="${n(t)}" target="_blank" rel="noopener noreferrer" title="Go to LowHigh (opens in new tab)">
                    <img class="head-logo" src="${G}" alt="" />
                    More from LowHigh
                </a>
                ${i}
            </div>
        `}renderApp(e,t){let i=e.slug===t,r=e.status==="coming_soon",o=e.icon_url?`<img src="${n(e.icon_url)}" alt="" loading="lazy" />`:n(e.name.charAt(0).toUpperCase()),l=r?'<span class="badge soon">Coming soon</span>':"",d=`
            <span class="app-icon" aria-hidden="true">${o}</span>
            <span class="app-main">
                <span class="app-name-row">
                    <span class="app-name">${n(e.name)}</span>
                    ${i?'<span class="current-tag">Current app</span>':l}
                </span>
                <span class="app-desc">${n(e.short_description)}</span>
            </span>
        `;return r?`<div class="app disabled" role="listitem">${d}</div>`:i?`<div class="app current" role="listitem" aria-current="page">${d}</div>`:`<a class="app" role="listitem" href="${n(e.url)}" target="_blank" rel="noopener noreferrer" aria-label="${n(e.name)} (opens in new tab)">${d}</a>`}};var M=["resolved","closed"],y={bug:"Bug","feature-request":"Feature request",general:"Question"};var Y="id,type,title,app_slug,status,priority,created_at,updated_at,ticket_comments(count)",F="id,user_id,body,is_admin_reply,is_system,created_at",_={open:"Open","in-review":"In review","in-progress":"In progress",resolved:"Resolved",closed:"Closed",duplicate:"Duplicate"},J=`${w}
.backdrop {
    position: fixed; inset: 0; z-index: var(--lhs-z);
    background: rgba(0, 0, 0, 0.55);
}
.sheet {
    position: fixed; z-index: calc(var(--lhs-z) + 1);
    top: 0; right: 0; bottom: 0;
    width: min(430px, 100vw);
    background: var(--lhs-bg);
    border-left: 1px solid var(--lhs-border);
    display: flex; flex-direction: column;
    box-shadow: -18px 0 50px rgba(0, 0, 0, 0.4);
    animation: lhs-slide-in 0.22s ease;
    padding-bottom: env(safe-area-inset-bottom);
}
@keyframes lhs-slide-in { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .sheet { animation: none; } }

.head {
    display: flex; align-items: center; gap: 10px;
    padding: max(14px, env(safe-area-inset-top)) 16px 12px;
    border-bottom: 1px solid var(--lhs-border); flex-shrink: 0;
}
.head-title { flex: 1; min-width: 0; font-size: 15px; font-weight: 700; }
.head button {
    width: 32px; height: 32px; border-radius: 10px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; color: var(--lhs-muted);
}
.head button:hover { background: var(--lhs-surface); color: var(--lhs-text); }
.head button:focus-visible { outline: 2px solid var(--lhs-accent); outline-offset: 1px; }

.body { flex: 1; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }

.primary-btn {
    display: flex; align-items: center; justify-content: center; gap: 7px;
    width: 100%; padding: 11px; border-radius: 12px;
    background: var(--lhs-accent); color: var(--lhs-accent-contrast);
    font-size: 14px; font-weight: 700; transition: filter 0.15s ease;
}
.primary-btn:hover { filter: brightness(1.08); }
.primary-btn:disabled { opacity: 0.55; cursor: default; }
.primary-btn:focus-visible { outline: 2px solid var(--lhs-text); outline-offset: 2px; }

.ticket {
    display: block; width: 100%; text-align: left;
    padding: 12px; border-radius: 12px;
    background: var(--lhs-surface); border: 1px solid var(--lhs-border);
    transition: border-color 0.15s ease;
}
.ticket:hover { border-color: color-mix(in srgb, var(--lhs-accent) 45%, transparent); }
.ticket:focus-visible { outline: 2px solid var(--lhs-accent); outline-offset: 1px; }
.ticket-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ticket-title { font-size: 13.5px; font-weight: 600; color: var(--lhs-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ticket-meta { margin-top: 4px; font-size: 11.5px; color: var(--lhs-muted); display: flex; gap: 8px; flex-wrap: wrap; }

.status { font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; flex-shrink: 0; }
.status.open, .status.in-review, .status.in-progress {
    color: var(--lhs-accent);
    background: color-mix(in srgb, var(--lhs-accent) 12%, transparent);
}
.status.resolved { color: #6fcf8f; background: rgba(74, 222, 128, 0.12); }
.status.closed, .status.duplicate { color: var(--lhs-muted); background: var(--lhs-surface); border: 1px solid var(--lhs-border); }

label { font-size: 12px; font-weight: 600; color: var(--lhs-muted); display: block; margin-bottom: 5px; }
.field { margin-bottom: 2px; }
input[type="text"], textarea, select {
    width: 100%; padding: 10px 11px; border-radius: 10px;
    background: var(--lhs-surface); border: 1px solid var(--lhs-border);
    color: var(--lhs-text); font-size: 13.5px;
}
input:focus, textarea:focus, select:focus { outline: 2px solid var(--lhs-accent); outline-offset: -1px; }
textarea { resize: vertical; min-height: 110px; line-height: 1.45; }
select { appearance: none; }

.detail-title { font-size: 15.5px; font-weight: 700; line-height: 1.35; }
.detail-meta { font-size: 12px; color: var(--lhs-muted); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.msg { padding: 11px 12px; border-radius: 12px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.msg.mine { background: var(--lhs-surface); border: 1px solid var(--lhs-border); }
.msg.team { background: color-mix(in srgb, var(--lhs-accent) 8%, transparent); border: 1px solid color-mix(in srgb, var(--lhs-accent) 25%, transparent); }
.msg.system { background: none; border: 1px dashed var(--lhs-border); color: var(--lhs-muted); font-size: 12px; }
.msg-who { font-size: 11px; font-weight: 700; color: var(--lhs-muted); margin-bottom: 3px; }
.msg.team .msg-who { color: var(--lhs-accent); }

.attach {
    display: flex; align-items: center; gap: 10px;
    padding: 8px; border-radius: 12px;
    background: var(--lhs-surface); border: 1px solid var(--lhs-border);
}
.attach-thumb {
    width: 52px; height: 52px; flex-shrink: 0;
    object-fit: cover; border-radius: 8px;
    border: 1px solid var(--lhs-border); background: var(--lhs-bg);
}
.attach-info { flex: 1; min-width: 0; }
.attach-name { font-size: 12.5px; font-weight: 600; color: var(--lhs-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attach-note { font-size: 11.5px; color: var(--lhs-muted); margin-top: 2px; }
.attach-remove {
    width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; color: var(--lhs-muted);
}
.attach-remove:hover { background: var(--lhs-bg); color: var(--lhs-text); }
.attach-remove:focus-visible { outline: 2px solid var(--lhs-accent); outline-offset: 1px; }

.reply { display: flex; flex-direction: column; gap: 8px; padding-top: 4px; }
.closed-note { font-size: 12.5px; color: var(--lhs-muted); text-align: center; padding: 8px 4px; line-height: 1.5; }
.empty { text-align: center; color: var(--lhs-muted); font-size: 13px; padding: 26px 10px; line-height: 1.5; }
.center { padding: 26px 0; }
`,R='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',Q='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>',k=class extends g{constructor(){super(...arguments);this.view="list";this.tickets=null;this.detail=null;this.comments=[];this.loading=!1;this.submitting=!1;this.errorMsg=null;this.draft={type:"bug",title:"",body:"",reply:""};this._pendingAttachment=null;this.attachmentRemoved=!1;this.onKeyDown=e=>{this.isOpen&&e.key==="Escape"&&this.close()}}static get observedAttributes(){return["open"]}get pendingAttachment(){return this._pendingAttachment}set pendingAttachment(e){this._pendingAttachment=e,this.scheduleRender()}get isOpen(){return this.hasAttribute("open")}attributeChangedCallback(e,t,i){e!=="open"||t===i||(i!==null&&(this.view="list",this.errorMsg=null,this.attachmentRemoved=!1,this.loadTickets()),this.scheduleRender())}connectedCallback(){super.connectedCallback(),document.addEventListener("keydown",this.onKeyDown)}disconnectedCallback(){document.removeEventListener("keydown",this.onKeyDown)}close(){this.removeAttribute("open"),this.dispatchEvent(new CustomEvent("lhs-close",{bubbles:!0,composed:!0}))}async loadTickets(){let e=this.config;if(e!=null&&e.accessToken){this.loading=!0,this.scheduleRender();try{this.tickets=await p(e,`support_tickets?select=${Y}&order=updated_at.desc`),this.errorMsg=null}catch(t){this.errorMsg="Could not load your tickets. Please try again.",console.error("[lowhigh-support] ticket list failed:",t)}finally{this.loading=!1,this.scheduleRender()}}}async openDetail(e){var i;let t=this.config;if(t!=null&&t.accessToken){this.view="detail",this.loading=!0,this.detail=null,this.comments=[],this.draft.reply="",this.scheduleRender();try{let[r,o]=await Promise.all([p(t,`support_tickets?id=eq.${e}&select=*`),p(t,`ticket_comments?ticket_id=eq.${e}&is_internal=eq.false&select=${F}&order=created_at.asc`)]);this.detail=(i=r[0])!=null?i:null,this.comments=o,this.errorMsg=this.detail?null:"Ticket not found."}catch(r){this.errorMsg="Could not load this ticket. Please try again.",console.error("[lowhigh-support] ticket detail failed:",r)}finally{this.loading=!1,this.scheduleRender()}}}async submitTicket(){let e=this.config;if(!(e!=null&&e.accessToken)||!e.userId||this.submitting)return;let t=this.draft.title.trim(),i=this.draft.body.trim();if(!t||!i){this.errorMsg="Please add a title and a description.",this.scheduleRender();return}this.submitting=!0,this.errorMsg=null,this.scheduleRender();try{let r=[];if(this._pendingAttachment&&!this.attachmentRemoved)try{r=[await this._pendingAttachment.upload()]}catch(l){console.warn("[lowhigh-support] attachment upload failed:",l)}let o=await p(e,"support_tickets",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({user_id:e.userId,type:this.draft.type,title:t,body:i,app_slug:e.appSlug||null,attachments:r,status:"open",priority:"medium"})});this.draft={type:"bug",title:"",body:"",reply:""},this._pendingAttachment=null,this.attachmentRemoved=!1,this.tickets=null,o[0]?await this.openDetail(o[0].id):(this.view="list",await this.loadTickets())}catch(r){this.errorMsg="Could not submit your ticket. Please try again.",console.error("[lowhigh-support] ticket create failed:",r)}finally{this.submitting=!1,this.scheduleRender()}}async submitReply(){let e=this.config,t=this.detail;if(!(e!=null&&e.accessToken)||!e.userId||!t||this.submitting)return;let i=this.draft.reply.trim();if(i){this.submitting=!0,this.errorMsg=null,this.scheduleRender();try{await p(e,"ticket_comments",{method:"POST",body:JSON.stringify({ticket_id:t.id,user_id:e.userId,body:i,is_internal:!1,is_system:!1})});try{await p(e,`support_tickets?id=eq.${t.id}`,{method:"PATCH",body:JSON.stringify({updated_at:new Date().toISOString()})})}catch(r){console.warn("[lowhigh-support] updated_at bump failed:",r)}this.draft.reply="",this.tickets=null,await this.openDetail(t.id)}catch(r){this.errorMsg="Could not send your reply. Please try again.",console.error("[lowhigh-support] reply failed:",r),this.submitting=!1,this.scheduleRender();return}this.submitting=!1,this.scheduleRender()}}render(){var r,o;if(!this.isOpen){this.root.innerHTML="";return}let e=!!((r=this.config)!=null&&r.accessToken&&((o=this.config)!=null&&o.userId)),t={list:"Support tickets",new:"New ticket",detail:"Ticket"},i=this.view!=="list";this.root.innerHTML=`
            <style>${J}</style>
            <div class="backdrop" part="backdrop"></div>
            <div class="sheet" role="dialog" aria-modal="true" aria-label="${t[this.view]}">
                <div class="head">
                    ${i?`<button type="button" data-act="back" aria-label="Back">${Q}</button>`:""}
                    <div class="head-title">${t[this.view]}</div>
                    <button type="button" data-act="close" aria-label="Close support">${R}</button>
                </div>
                <div class="body">
                    ${this.errorMsg?`<div class="error-note" role="alert">${n(this.errorMsg)}</div>`:""}
                    ${e?this.renderView():this.renderSignedOut()}
                </div>
            </div>
        `,this.bind(e)}renderSignedOut(){return'<div class="empty">Sign in to view and submit support tickets. Your tickets follow your LowHigh account across every app.</div>'}renderView(){return this.loading?'<div class="center"><div class="spinner"></div></div>':this.view==="new"?this.renderNew():this.view==="detail"?this.renderDetail():this.renderList()}renderList(){var i;let e=(i=this.tickets)!=null?i:[];return`
            <button type="button" class="primary-btn" data-act="new">New ticket</button>
            ${e.length?e.map(r=>{var l,d,u,m,f;let o=(u=(d=(l=r.ticket_comments)==null?void 0:l[0])==null?void 0:d.count)!=null?u:0;return`
                        <button type="button" class="ticket" data-ticket="${n(r.id)}">
                            <span class="ticket-top">
                                <span class="ticket-title">${n(r.title)}</span>
                                <span class="status ${n(r.status)}">${(m=_[r.status])!=null?m:n(r.status)}</span>
                            </span>
                            <span class="ticket-meta">
                                <span>${(f=y[r.type])!=null?f:n(r.type)}</span>
                                <span>${v(r.updated_at)}</span>
                                ${o?`<span>${o} ${o===1?"reply":"replies"}</span>`:""}
                            </span>
                        </button>`}).join(""):'<div class="empty">No tickets yet. If something is not working or you have a question, we are here to help.</div>'}
        `}renderNew(){return`
            <div class="field">
                <label for="t-type">What is this about?</label>
                <select id="t-type">${Object.keys(y).map(t=>`<option value="${t}" ${this.draft.type===t?"selected":""}>${y[t]}</option>`).join("")}</select>
            </div>
            <div class="field">
                <label for="t-title">Title</label>
                <input id="t-title" type="text" maxlength="140" value="${n(this.draft.title)}"
                    placeholder="A short summary" />
            </div>
            <div class="field">
                <label for="t-body">Description</label>
                <textarea id="t-body" maxlength="5000"
                    placeholder="What happened? What did you expect?">${n(this.draft.body)}</textarea>
            </div>
            ${this.renderAttachment()}
            <button type="button" class="primary-btn" data-act="submit" ${this.submitting?"disabled":""}>
                ${this.submitting?"Submitting":"Submit ticket"}
            </button>
        `}renderAttachment(){let e=this._pendingAttachment;return!e||this.attachmentRemoved?"":`
            <div class="attach" role="group" aria-label="Attached screenshot">
                <img class="attach-thumb" src="${n(e.previewUrl)}" alt="Screenshot of your screen" />
                <div class="attach-info">
                    <div class="attach-name">${n(e.name)}</div>
                    <div class="attach-note">Attached to help us troubleshoot</div>
                </div>
                <button type="button" class="attach-remove" data-act="remove-attachment" aria-label="Remove screenshot">${R}</button>
            </div>
        `}renderDetail(){var o,l;let e=this.detail;if(!e)return'<div class="empty">This ticket could not be loaded.</div>';let t=M.includes(e.status),i=this.comments.map(d=>{if(d.is_system)return`<div class="msg system">${n(d.body)}</div>`;let u=d.is_admin_reply;return`
                    <div class="msg ${u?"team":"mine"}">
                        <div class="msg-who">${u?"LowHigh team":"You"} \xB7 ${v(d.created_at)}</div>
                        ${n(d.body)}
                    </div>`}).join(""),r=t?`<div class="closed-note">This ticket is ${_[e.status].toLowerCase()}. If you need more help, open a new ticket.</div>`:`
                <div class="reply">
                    <textarea id="t-reply" maxlength="5000" placeholder="Write a reply">${n(this.draft.reply)}</textarea>
                    <button type="button" class="primary-btn" data-act="reply" ${this.submitting?"disabled":""}>
                        ${this.submitting?"Sending":"Send reply"}
                    </button>
                </div>`;return`
            <div class="detail-title">${n(e.title)}</div>
            <div class="detail-meta">
                <span class="status ${n(e.status)}">${(o=_[e.status])!=null?o:n(e.status)}</span>
                <span>${(l=y[e.type])!=null?l:n(e.type)}</span>
                <span>${v(e.created_at)}</span>
            </div>
            <div class="msg mine">
                <div class="msg-who">You \xB7 ${v(e.created_at)}</div>
                ${n(e.body)}
            </div>
            ${i}
            ${r}
        `}bind(e){var t,i,r,o,l,d,u,m,f,C,E;(t=this.qs(".backdrop"))==null||t.addEventListener("click",()=>this.close()),(i=this.qs('[data-act="close"]'))==null||i.addEventListener("click",()=>this.close()),(r=this.qs('[data-act="back"]'))==null||r.addEventListener("click",()=>{this.view="list",this.errorMsg=null,this.tickets||this.loadTickets(),this.scheduleRender()}),e&&((o=this.qs('[data-act="new"]'))==null||o.addEventListener("click",()=>{this.view="new",this.errorMsg=null,this.scheduleRender()}),this.qsa("[data-ticket]").forEach(c=>c.addEventListener("click",()=>void this.openDetail(c.dataset.ticket))),(l=this.qs("#t-type"))==null||l.addEventListener("change",c=>{this.draft.type=c.target.value}),(d=this.qs("#t-title"))==null||d.addEventListener("input",c=>{this.draft.title=c.target.value}),(u=this.qs("#t-body"))==null||u.addEventListener("input",c=>{this.draft.body=c.target.value}),(m=this.qs("#t-reply"))==null||m.addEventListener("input",c=>{this.draft.reply=c.target.value}),(f=this.qs('[data-act="remove-attachment"]'))==null||f.addEventListener("click",()=>{this.attachmentRemoved=!0,this.scheduleRender()}),(C=this.qs('[data-act="submit"]'))==null||C.addEventListener("click",()=>void this.submitTicket()),(E=this.qs('[data-act="reply"]'))==null||E.addEventListener("click",()=>void this.submitReply()))}};customElements.get("lowhigh-launcher")||customElements.define("lowhigh-launcher",x);customElements.get("lowhigh-support")||customElements.define("lowhigh-support",k);return O(V);})();
