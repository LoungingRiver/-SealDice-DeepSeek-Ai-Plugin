// ==UserScript==
// @name         Deepseek AI Plugin
// @author       懒河
// @version      2.3.0
// @description  在保证了数据兼容性的情况下新增思考模式与强度控制，模型升级至deepseek-v4-flash，需老版本用户对插件进行更新时手动更新大模型名称，亦可使用deepseek-v4-pro，相较而言更推荐快捷且经济的前者deepseek-v4-flash，而后者更能适应复杂的需要，但是更烧钱。根据海豹1.6.0更新调整了配置项界面，同时1.6.0以下版本仍可继续使用该插件。增设多个关键词配置选项。整合了随机插话，加入了独立的插话摘要，且在私聊中读取个人对话上下文数据+个人对话摘要+群里插话摘要，在群聊中读取群聊上下文数据+插话对话摘要+个人对话摘要，以保证更好的使用体验。
// @license      MIT
// @timestamp    2026/08/25
// @updateUrl    https://github.com/LoungingRiver/-SealDice-DeepSeek-Ai-Plugin.git
// @sealVersion  1.6.0
// ==/UserScript==

if (!seal.ext.find('deepseekai')) {
    const ext = seal.ext.new('deepseekai', '懒河', '2.3.0');
    seal.ext.register(ext);

    // ==================== 配置注册辅助函数 ====================

    // 兼容读取配置值的工具：统一从 ConfigItem 对象中取出"值"
    function getConfigValue(configKey, fallback) {
        try {
            const cfg = seal.ext.getConfig(ext, configKey);
            if (!cfg) return fallback;
            if ('value' in cfg) {
                const v = cfg.value;
                if (v === undefined || v === null) return fallback;
                return v;
            }
            return cfg;
        } catch (e) { return fallback; }
    }

    function registerStringIfNotExists(configKey, defaultValue, description, group) {
        const existing = seal.ext.getConfig(ext, configKey);
        if (existing !== null && existing !== undefined) {
            try { if (existing.group !== group) { existing.group = group; if (typeof seal.ext.registerConfig === 'function') seal.ext.registerConfig(ext, existing); } } catch (e) {}
            return;
        }
        seal.ext.registerStringConfig(ext, configKey, defaultValue, description, group);
    }

    function registerTemplateIfNotExists(configKey, defaultValue, description, group) {
        const existing = seal.ext.getConfig(ext, configKey);
        if (existing !== null && existing !== undefined) {
            try { if (existing.group !== group) { existing.group = group; if (typeof seal.ext.registerConfig === 'function') seal.ext.registerConfig(ext, existing); } } catch (e) {}
            return;
        }
        seal.ext.registerTemplateConfig(ext, configKey, defaultValue, description, group);
    }

    function registerBoolIfNotExists(configKey, defaultValue, description, group) {
        const existing = seal.ext.getConfig(ext, configKey);
        if (existing !== null && existing !== undefined) {
            if (typeof existing.value === 'string') {
                const oldVal = existing.value;
                let migrated;
                if (oldVal === "enabled" || oldVal === "true") migrated = true;
                else if (oldVal === "disabled" || oldVal === "false") migrated = false;
                if (migrated !== undefined) {
                    try { seal.ext.registerBoolConfig(ext, configKey, migrated, description, group); console.log(`[配置迁移] ${configKey}: "${oldVal}" → ${migrated}（bool）`); } catch (e) {}
                }
            }
            try { const cur = seal.ext.getConfig(ext, configKey); if (cur && cur.group !== group) { cur.group = group; if (typeof seal.ext.registerConfig === 'function') seal.ext.registerConfig(ext, cur); } } catch (e) {}
            return;
        }
        seal.ext.registerBoolConfig(ext, configKey, defaultValue, description, group);
    }

    // 非指令关键词：以 TemplateConfig（数组）注册；旧字符串自动迁移为数组
    function registerKeywordsIfNotExists(configKey, defaultArray, description, group) {
        const existing = seal.ext.getConfig(ext, configKey);
        if (existing !== null && existing !== undefined) {
            if (typeof existing.value === 'string') {
                const oldStr = existing.value;
                try { const arr = oldStr ? [oldStr] : defaultArray; seal.ext.registerTemplateConfig(ext, configKey, arr, description, group); console.log(`[配置迁移] ${configKey}: 字符串"${oldStr}" → 数组${JSON.stringify(arr)}`); } catch (e) {}
            }
            try { const cur = seal.ext.getConfig(ext, configKey); if (cur && cur.group !== group) { cur.group = group; if (typeof seal.ext.registerConfig === 'function') seal.ext.registerConfig(ext, cur); } } catch (e) {}
            return;
        }
        seal.ext.registerTemplateConfig(ext, configKey, defaultArray, description, group);
    }

    function getTriggerKeywords() {
        let raw = getConfigValue("非指令关键词", null);
        if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'value' in raw) raw = raw.value;
        if (Array.isArray(raw)) return raw.map(String).filter(w => w && w.trim().length > 0);
        if (typeof raw === 'string') return raw.trim() ? [raw] : [];
        return [];
    }

    // ==================== 注册配置项（按分组） ====================

    // —— 基础设置组 ——
    registerStringIfNotExists("大模型url", "https://api.deepseek.com/v1/chat/completions", "大模型 API 地址", "基础设置");
    registerStringIfNotExists("大模型模型名", "deepseek-v4-flash", "大模型模型名称", "基础设置");
    registerStringIfNotExists("你的APIkeys", "sk-your-api-key-here", "你的 API Key", "基础设置");
    registerStringIfNotExists("最大回复tokens数", "600", "最大回复 tokens 数", "基础设置");
    registerStringIfNotExists("摘要生成最大tokens数", "1000", "摘要生成最大 tokens 数", "基础设置");
    registerStringIfNotExists("存储上下文对话限制轮数", "16", "存储上下文对话限制轮数", "基础设置");
    registerStringIfNotExists("Temperature", "1.3", "Temperature 设置 (0.0-2.0)", "基础设置");
    registerBoolIfNotExists("思考模式开关", true, "思考模式开关（开/关）", "基础设置");
    (function registerReasoningEffort() {
        const key = "思考强度";
        const existing = seal.ext.getConfig(ext, key);
        if (existing !== null && existing !== undefined) {
            try { if (existing.group !== "基础设置") { existing.group = "基础设置"; if (typeof seal.ext.registerConfig === 'function') seal.ext.registerConfig(ext, existing); } } catch (e) {}
            return;
        }
        seal.ext.registerOptionConfig(ext, key, "high", ["high", "max"], "思考强度设置 (high/max)", "基础设置");
    })();

    // —— 个性配置组 ——
    registerStringIfNotExists("角色设定", "你是一只黑猫骰骰娘，主要用于测试，乐于为测试者提供一切需要的服务。在必要时应当回答包括已知的时间信息，摘要内容等相关的提问。", "角色设定（系统提示词）", "个性配置");
    registerKeywordsIfNotExists("非指令关键词", ["小伊"], "触发对话的关键词（每行一个，支持多个）", "个性配置");
    registerStringIfNotExists("摘要生成提示词", "请基于之前的对话摘要和最新的对话内容，更新对话摘要。保留重要信息，添加新内容，确保摘要的连贯性和完整性。", "摘要生成提示词", "个性配置");
    const libraryKeys = ["full_library", "sub1_library", "sub2_library", "sub3_library"];
    libraryKeys.forEach((libKey) => {
        const existing = seal.ext.getConfig(ext, libKey);
        if (existing !== null && existing !== undefined) {
            try { if (existing.group !== "个性配置") { existing.group = "个性配置"; if (typeof seal.ext.registerConfig === 'function') seal.ext.registerConfig(ext, existing); } } catch (e) {}
            return;
        }
        seal.ext.registerStringConfig(ext, libKey, "", `${libKey} 长文本资料库内容（支持多行文本）`, "个性配置");
    });

    // —— 权限设置组 ——
    registerBoolIfNotExists("白名单开关", true, "白名单开关（开/关）", "权限设置");
    registerTemplateIfNotExists("允许使用群号", ["QQ-Group:123456", "QQ-Group:654321"], "限制允许接收消息的群号", "权限设置");
    registerTemplateIfNotExists("允许使用私聊", ["QQ:111111", "QQ:222222"], "限制允许接收消息的私聊", "权限设置");

    // —— 随机插话设置组 ——
    registerBoolIfNotExists("随机插话开关", false, "随机插话功能开关（开/关，默认关）", "随机插话设置");
    registerStringIfNotExists("随机插话每N条触发", "5", "每累计 N 条群消息自动触发一次随机插话", "随机插话设置");
    registerStringIfNotExists("随机插话开启关键词", "开启随机插话", "指令：开启随机插话（仅高权限）", "随机插话设置");
    registerStringIfNotExists("随机插话关闭关键词", "关闭随机插话", "指令：关闭随机插话（仅高权限）", "随机插话设置");
    registerStringIfNotExists("随机插话开启回复", "随机插话已开启", "开启成功回复语", "随机插话设置");
    registerStringIfNotExists("随机插话关闭回复", "随机插话已关闭", "关闭成功回复语", "随机插话设置");
    registerStringIfNotExists("随机插话强制触发关键词", "强制插话", "包含此关键词的消息强制立即触发一次插话", "随机插话设置");
    registerStringIfNotExists("随机插话群聊上下文轮数", "8", "群聊（插话）上下文保留轮数", "随机插话设置");
    registerStringIfNotExists("随机插话摘要提示词", "请基于之前的群聊插话摘要和最新的群聊插话对话内容，更新群聊插话摘要。保留群聊中的关键信息、话题走向和重要结论，添加新内容，确保摘要的连贯性和完整性。", "随机插话摘要生成提示词（独立于个人对话摘要提示词）", "随机插话设置");

    // ==================== 配置分组迁移 ====================
    function migrateConfigGroups() {
        const groupMap = {
            "大模型url": "基础设置", "大模型模型名": "基础设置", "你的APIkeys": "基础设置",
            "最大回复tokens数": "基础设置", "摘要生成最大tokens数": "基础设置",
            "存储上下文对话限制轮数": "基础设置", "Temperature": "基础设置",
            "思考模式开关": "基础设置", "思考强度": "基础设置",
            "角色设定": "个性配置", "非指令关键词": "个性配置", "摘要生成提示词": "个性配置",
            "full_library": "个性配置", "sub1_library": "个性配置", "sub2_library": "个性配置", "sub3_library": "个性配置",
            "白名单开关": "权限设置", "允许使用群号": "权限设置", "允许使用私聊": "权限设置",
            "随机插话开关": "随机插话设置", "随机插话每N条触发": "随机插话设置",
            "随机插话开启关键词": "随机插话设置", "随机插话关闭关键词": "随机插话设置",
            "随机插话开启回复": "随机插话设置", "随机插话关闭回复": "随机插话设置",
            "随机插话强制触发关键词": "随机插话设置", "随机插话群聊上下文轮数": "随机插话设置",
            "随机插话摘要提示词": "随机插话设置"
        };
        let migratedCount = 0;
        Object.entries(groupMap).forEach(([key, targetGroup]) => {
            try {
                const cfg = seal.ext.getConfig(ext, key);
                if (cfg && cfg.group !== targetGroup) { cfg.group = targetGroup; if (typeof seal.ext.registerConfig === 'function') seal.ext.registerConfig(ext, cfg); migratedCount++; }
            } catch (e) {}
        });
        if (migratedCount > 0) console.log(`[DeepseekAI] 配置分组迁移完成，共迁移 ${migratedCount} 项`);
    }
    migrateConfigGroups();

    // ==================== 工具函数 ====================
    function getCurrentTimeStamp() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }
    function getTodayUntilNow() { const n = new Date(); return n.getHours()*3600 + n.getMinutes()*60 + n.getSeconds(); }
    function parseMarkdown(text) {
        if (!text) return "";
        text = text.replace(/```(json)?([\s\S]*?)```/g, (m, isJson, c) => `\`\`\`${isJson||''}\n${c}\n\`\`\``);
        text = text.replace(/`([^`]+)`/g, '$1');
        text = text.replace(/!\[.*?\]\(.*?\)/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1');
        text = text.replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(\*|_)(.*?)\1/g, '$2');
        text = text.replace(/^#+\s+/gm, '').replace(/^>\s+/gm, '').replace(/^[\*\-\+]\s+/gm, '');
        text = text.replace(/^\|.*?\|$/gm, '').replace(/^[-*_]{3,}$/gm, '').replace(/<[^>]+>/g, '');
        text = text.replace(/\n{3,}/g, '\n\n');
        return text.trim();
    }

    // ==================== DeepseekAI 核心类（个人对话/摘要） ====================
    class DeepseekAI {
        constructor(userId) {
            this.userId = userId;
            this.context = [];
            this.loadContext();
            this.initializeSummarySystem();
        }
        initializeSummarySystem() {
            try {
                const summary = this.loadSummary();
                const hasOldData = this.context && this.context.length > 0;
                const hasValidSummary = summary.content && summary.content.trim().length > 0;
                if (hasOldData && !hasValidSummary && this.context.length > 3) this.generateInitialSummarySync();
                else if (hasValidSummary) this.updateSystemContext();
            } catch (e) { console.error(`[摘要系统初始化错误] 用户 ${this.userId}:`, e); }
        }
        generateInitialSummarySync() {
            try {
                const recent = this.context.slice(-4);
                if (recent.length === 0) return;
                let s = "历史对话包含以下内容：";
                const topics = [];
                for (const m of recent) { if (m.role === "user") { const c = m.content.replace(/from .+?\[.+?\]: /, ''); if (c.length > 10) topics.push(c.substring(0,50)+(c.length>50?"...":"")); } }
                if (topics.length > 0) { s += topics.slice(0,3).join("；"); this.saveSummary(s); this.updateSystemContext(); }
            } catch (e) { console.error(`[初始摘要生成错误] 用户 ${this.userId}:`, e); this.saveSummary("开始新的对话"); this.updateSystemContext(); }
        }
        loadSummary() {
            try {
                const newKey = `deepseek_summary_${this.userId}`;
                let saved = ext.storageGet(newKey); let isNew = true;
                if (!saved) { saved = ext.storageGet(`${this.userId}_summary`); if (!saved) saved = ext.storageGet(this.userId); isNew = false; if (saved) console.log(`[摘要迁移] 用户 ${this.userId} 旧格式摘要迁移`); }
                if (saved) {
                    let p; if (typeof saved === 'string') { try { p = JSON.parse(saved); } catch (e) { const sm = {content:saved,lastUpdated:getCurrentTimeStamp(),version:"1.0"}; if(!isNew) ext.storageSet(newKey,JSON.stringify(sm)); return sm; } } else p = saved;
                    if (p && typeof p.content === 'string') { const sm = {content:p.content||"",lastUpdated:p.lastUpdated||getCurrentTimeStamp(),version:p.version||"1.0"}; if(!isNew) ext.storageSet(newKey,JSON.stringify(sm)); return sm; }
                }
            } catch (e) { console.error(`[摘要加载错误] 用户 ${this.userId}:`, e); }
            return { content: "", lastUpdated: getCurrentTimeStamp(), version: "1.0" };
        }
        saveSummary(c) { ext.storageSet(`deepseek_summary_${this.userId}`, JSON.stringify({content:c||"",lastUpdated:getCurrentTimeStamp(),version:"1.0"})); }
        resetSummary() { this.saveSummary(""); this.updateSystemContext(); return "对话摘要已重置"; }
        getTemperature() { const t = parseFloat(getConfigValue("Temperature", "1.3")); return isNaN(t)?1.3:Math.max(0,Math.min(2,t)); }
        updateSystemContext(force=false) {
            try {
                let sys = getConfigValue("角色设定", "");
                const summary = this.loadSummary();
                const lib = this.getAllLibrariesContent();
                if (lib) sys += `\n\n【资料库信息】\n${lib}\n──────────\n`;
                if (summary.content && summary.content.trim().length > 0) sys += `\n\n【先前对话摘要】\n${summary.content}\n──────────\n`;
                if (!this.context || !this._validateContext(this.context)) { this._resetConversation(false); return; }
                this._ensureSystemMessage(sys);
                if (force) ext.storageSet(`deepseek_ctx_${this.userId}`, JSON.stringify(this.context));
            } catch (e) { console.error(`[系统上下文更新错误] 用户 ${this.userId}:`, e); }
        }
        _ensureSystemMessage(sys) { if (!this.context||this.context.length===0){this.context=[{role:"system",content:sys}];return;} if(this.context[0]&&this.context[0].role==="system")this.context[0].content=sys;else this.context.unshift({role:"system",content:sys}); }
        _validateContext(d){try{if(!Array.isArray(d))return false;if(d.length===0)return false;return d.every(m=>m&&typeof m==='object'&&m.role&&m.content);}catch(e){return false;}}
        _isOldDataFormat(d){if(!Array.isArray(d))return false;for(const m of d){if(m.role==="user"&&m.content&&m.content.includes('): ')&&!m.content.includes(']'))return true;}return false;}
        _migrateOldData(old){try{if(!Array.isArray(old))return this._createNewConversation();const nc=[];let hs=false;for(const m of old){if(m.role==="system"){hs=true;nc.push(m);}}if(!hs)nc.unshift({role:"system",content:getConfigValue("角色设定","")});for(const m of old){if(m.role!=="system"){if(m.role==="user"&&!m.content.includes('[')){const ts=getCurrentTimeStamp(),td=getTodayUntilNow();nc.push({role:m.role,content:this._addTimestampToOldMessage(m.content,ts,td)});}else nc.push(m);}}return nc;}catch(e){console.error(`[数据迁移错误] 用户 ${this.userId}:`,e);return this._createNewConversation();}}
        _addTimestampToOldMessage(o,t,s){if(o.startsWith('from ')&&o.includes('): ')){const p=o.split('): ');if(p.length===2)return `${p[0]})[${t}|${s}s]: ${p[1]}`;}return `from 系统（QQ:${this.userId}）[${t}|${s}s]: ${o}`;}
        _createNewConversation(){const ts=getCurrentTimeStamp(),td=getTodayUntilNow();return[{role:"system",content:getConfigValue("角色设定","")},{role:"user",content:`from 新用户（QQ:${this.userId}）[${ts}|${td}s]: 你好`},{role:"assistant",content:"准备好啦~"}];}
        _resetConversation(resetSum=false){const ts=getCurrentTimeStamp(),td=getTodayUntilNow();this.context=[{role:"system",content:getConfigValue("角色设定","")},{role:"user",content:`from 系统（QQ:${this.userId}）[${ts}|${td}s]: 对话已重置`},{role:"assistant",content:resetSum?"检测到问题，已重置对话和摘要~":"检测到问题，已重置对话（摘要保留）~"}];if(resetSum)this.saveSummary("");ext.storageSet(`deepseek_ctx_${this.userId}`,JSON.stringify(this.context));}
        loadContext(){try{const nk=`deepseek_ctx_${this.userId}`;let saved=ext.storageGet(nk);let isN=true;if(!saved){saved=ext.storageGet(this.userId);isN=false;if(saved)console.log(`[对话迁移] 用户 ${this.userId} 旧格式对话迁移`);}if(saved){let p;if(typeof saved==='string'){try{p=JSON.parse(saved);}catch(e){p=null;}}else p=saved;if(this._validateContext(p)){if(this._isOldDataFormat(p))this.context=this._migrateOldData(p);else this.context=p;if(!isN){ext.storageSet(nk,JSON.stringify(this.context));console.log(`[对话迁移完成] 用户 ${this.userId}`);}return;}}this.context=this._createNewConversation();ext.storageSet(nk,JSON.stringify(this.context));}catch(e){console.error(`[上下文加载错误] 用户 ${this.userId}:`,e);this.context=this._createNewConversation();ext.storageSet(`deepseek_ctx_${this.userId}`,JSON.stringify(this.context));}}
        _enforceRules(){const maxRounds=parseInt(getConfigValue("存储上下文对话限制轮数","4"))||4;const maxM=maxRounds*2;if(this.context.length>maxM+1){const sys=this.context.find(m=>m.role==="system")||{role:"system",content:getConfigValue("角色设定","")};this.context=[sys,...this.context.slice(-maxM)];ext.storageSet(`deepseek_ctx_${this.userId}`,JSON.stringify(this.context));}}
        parseLibraryContent(n){return (getConfigValue(n,"")||"").trim();}
        getLibraryType(n){return ({full_library:"完整资料库",sub1_library:"子资料库1",sub2_library:"子资料库2",sub3_library:"子资料库3"})[n]||"通用资料";}
        getAllLibrariesContent(){let r="";for(const n of ["full_library","sub1_library","sub2_library","sub3_library"]){const c=this.parseLibraryContent(n);if(c)r+=`【${this.getLibraryType(n)}】\n${c}\n\n`;}return r.trim();}
        getLibraryStats(){return ["full_library","sub1_library","sub2_library","sub3_library"].map(n=>({name:n,configType:this.getLibraryType(n),contentLength:this.parseLibraryContent(n).length,hasContent:this.parseLibraryContent(n).length>0}));}
        buildApiRequest(messages){const te=getConfigValue("思考模式开关",true);const re=getConfigValue("思考强度","high");const b={model:getConfigValue("大模型模型名","deepseek-v4-flash"),messages,max_tokens:parseInt(getConfigValue("最大回复tokens数","600"))||600,temperature:this.getTemperature(),stream:false};if(te){b.reasoning_effort=re;b.extra_body={thinking:{type:"enabled"}};}return b;}
        async chat(text, ctx, msg) {
            this.updateSystemContext();
            if (!this._validateContext(this.context)) this._resetConversation(false);
            const ts = getCurrentTimeStamp(), td = getTodayUntilNow();
            this.context.push({role:"user",content:`from ${msg.sender.nickname}（QQ:${msg.sender.userId}）[${ts}|${td}s]: ${text}`});
            this._enforceRules();
            try {
                const msgs = [...this.context];
                const resp = await fetch(getConfigValue("大模型url","https://api.deepseek.com/v1/chat/completions"),{method:"POST",headers:{Authorization:`Bearer ${getConfigValue("你的APIkeys","")}`,"Content-Type":"application/json"},body:JSON.stringify(this.buildApiRequest(msgs))});
                if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
                const data = await resp.json();
                if (data.choices?.[0]?.message) {
                    const reply = data.choices[0].message.content; const clean = parseMarkdown(reply);
                    this.context.push({role:"assistant",content:reply});
                    ext.storageSet(`deepseek_ctx_${this.userId}`, JSON.stringify(this.context));
                    this.generateSummaryAsync();
                    return seal.replyToSender(ctx, msg, clean.replace(/from .+?: /g,""));
                }
                throw new Error("Invalid API response: No choices found");
            } catch (e) { console.error(`[对话错误] 用户 ${this.userId}:`, e); this._resetConversation(false); return seal.replyToSender(ctx, msg, e.message.includes('HTTP')||e.message.includes('Network')?"网络连接失败，已保留对话记录，请稍后重试":`API请求失败: ${e.message}\n已自动重置对话上下文`); }
        }
        async generateSummaryAsync() {
            if (this.context.length < 4) return;
            setTimeout(async () => {
                try {
                    const prev = this.loadSummary(); const recent = this.context.slice(-6);
                    let sp = [];
                    if (prev.content && prev.content.trim().length > 0) sp.push({role:"system",content:`之前的对话摘要：${prev.content}\n\n请基于这个摘要和最新的对话内容，更新对话摘要。`});
                    sp = [...sp, ...recent, {role:"user",content:getConfigValue("摘要生成提示词","")}];
                    const r = await fetch(getConfigValue("大模型url","https://api.deepseek.com/v1/chat/completions"),{method:"POST",headers:{Authorization:`Bearer ${getConfigValue("你的APIkeys","")}`,"Content-Type":"application/json"},body:JSON.stringify({model:getConfigValue("大模型模型名","deepseek-v4-flash"),messages:sp,max_tokens:parseInt(getConfigValue("摘要生成最大tokens数","1000"))||300})});
                    if (r.ok) { const d = await r.json(); if (d.choices?.[0]?.message) { this.saveSummary(d.choices[0].message.content.trim()); this.updateSystemContext(); } }
                } catch (e) { console.error(`[摘要生成错误] 用户 ${this.userId}:`, e); }
            }, 500);
        }
        viewSummary(){const s=this.loadSummary();return s.content&&s.content.trim().length>0?`最后更新: ${s.lastUpdated}\n对话摘要: ${s.content}`:"暂无对话摘要";}
        async updateSummary(){try{await this.generateSummaryAsync();return "对话摘要已更新";}catch(e){console.error(`[手动摘要更新错误] 用户 ${this.userId}:`,e);return "摘要更新失败";}}
    }

    // ==================== 随机插话系统 ====================
    const CHAOS_STATE_KEY = "deepseek_chaos_statemap";
    let chaosState = { ai:{}, last:{}, total:{}, remain:{} };
    try { const s = ext.storageGet(CHAOS_STATE_KEY); if (s) { const p = typeof s==='string'?JSON.parse(s):s; if (p && typeof p==='object') chaosState = {...chaosState, ...p}; } } catch (e) {}

    function saveChaosState() { try { ext.storageSet(CHAOS_STATE_KEY, JSON.stringify(chaosState)); } catch (e) {} }
    function getChaosCtxKey(groupId) { return `deepseek_chaosctx_${groupId}`; }
    function getChaosSumKey(groupId) { return `deepseek_chaossummary_${groupId}`; }

    function loadChaosContext(groupId) {
        try { const saved = ext.storageGet(getChaosCtxKey(groupId)); if (saved) { const p = typeof saved==='string'?JSON.parse(saved):saved; if (Array.isArray(p) && p.length>0) return p; } }
        catch (e) { console.error(`[插话上下文加载错误] ${groupId}:`, e); }
        return [{role:"system",content:getConfigValue("角色设定","")}];
    }
    function saveChaosContext(groupId, ctx) { try { ext.storageSet(getChaosCtxKey(groupId), JSON.stringify(ctx)); } catch (e) {} }
    function loadChaosSummary(groupId) {
        try { const saved = ext.storageGet(getChaosSumKey(groupId)); if (saved) { const p = typeof saved==='string'?JSON.parse(saved):saved; if (p&&typeof p.content==='string') return p; } }
        catch (e) {} return {content:"",lastUpdated:getCurrentTimeStamp(),version:"1.0"};
    }
    function saveChaosSummary(groupId, c) { try { ext.storageSet(getChaosSumKey(groupId), JSON.stringify({content:c||"",lastUpdated:getCurrentTimeStamp(),version:"1.0"})); } catch (e) {} }

    // 构建插话 system：角色设定 + 资料库 + 插话摘要 + 个人摘要（若有）
    function buildChaosSystemContext(groupId, personalUserId) {
        let sys = getConfigValue("角色设定","");
        const libs = ["full_library","sub1_library","sub2_library","sub3_library"];
        let libC = ""; for (const n of libs) { const c = (getConfigValue(n,"")||"").trim(); if (c) libC += `【${({full_library:"完整资料库",sub1_library:"子资料库1",sub2_library:"子资料库2",sub3_library:"子资料库3"})[n]}】\n${c}\n\n`; }
        if (libC) sys += `\n\n【资料库信息】\n${libC.trim()}\n──────────\n`;
        const cs = loadChaosSummary(groupId);
        if (cs.content && cs.content.trim().length > 0) sys += `\n\n【群聊插话摘要】\n${cs.content}\n──────────\n`;
        if (personalUserId) {
            try { const ps = new DeepseekAI(personalUserId).loadSummary(); if (ps.content && ps.content.trim().length > 0) sys += `\n\n【发言者个人对话摘要】\n${ps.content}\n──────────\n`; } catch (e) {}
        }
        return sys;
    }

    // 确保插话上下文以最新 system 开头
    function ensureChaosSystem(groupId, personalUserId) {
        const sm = {role:"system",content:buildChaosSystemContext(groupId, personalUserId)};
        let cctx = loadChaosContext(groupId);
        if (cctx.length>0 && cctx[0] && cctx[0].role==="system") cctx[0] = sm; else cctx.unshift(sm);
        return cctx;
    }

    // 截断插话上下文到配置的群聊上下文轮数
    function truncateChaosContext(cctx) {
        const maxR = (parseInt(getConfigValue("随机插话群聊上下文轮数","8"))||8)*2 + 1;
        if (cctx.length > maxR) cctx = [cctx[0], ...cctx.slice(-(maxR-1))];
        return cctx;
    }

    // 异步生成/更新插话摘要（使用随机插话设置分组下独立的"随机插话摘要提示词"，与个人对话摘要提示词互不干扰）
    function generateChaosSummaryAsync(groupId) {
        setTimeout(async () => {
            try {
                const nc = loadChaosContext(groupId);
                if (nc.length < 3) return; // 至少 system+user+assistant
                const prev = loadChaosSummary(groupId); const recent = nc.slice(-6);
                const chaosSp = getConfigValue("随机插话摘要提示词","");
                let sp=[];
                if (prev.content&&prev.content.trim().length>0) sp.push({role:"system",content:`之前的群聊插话摘要：${prev.content}\n\n请基于该摘要和最新插话内容更新摘要。`});
                sp=[...sp,...recent,{role:"user",content:chaosSp}];
                const r=await fetch(getConfigValue("大模型url","https://api.deepseek.com/v1/chat/completions"),{method:"POST",headers:{Authorization:`Bearer ${getConfigValue("你的APIkeys","")}`,"Content-Type":"application/json"},body:JSON.stringify({model:getConfigValue("大模型模型名","deepseek-v4-flash"),messages:sp,max_tokens:parseInt(getConfigValue("摘要生成最大tokens数","1000"))||300})});
                if (r.ok) { const d=await r.json(); if (d.choices?.[0]?.message) saveChaosSummary(groupId, d.choices[0].message.content.trim()); }
            } catch(e) { console.error(`[插话摘要生成错误] ${groupId}:`,e); }
        }, 500);
    }

    // 随机插话触发：累计到阈值 或 含强制触发关键词
    async function triggerChaos(ctx, msg, groupId) {
        const N = parseInt(getConfigValue("随机插话每N条触发","5")) || 5;
        const forceKw = getConfigValue("随机插话强制触发关键词","") || "";
        const isForce = forceKw && msg.message.includes(forceKw);
        const remain = (chaosState.remain[groupId] === undefined) ? N : chaosState.remain[groupId];
        // 负值或 0 → 触发（保证阈值到达必触发）；强制触发始终触发
        const should = isForce || (remain <= 0);
        if (!should) return false;

        // 构造插话上下文（含最新 system + 累积的历史 user/assistant）
        let cctx = ensureChaosSystem(groupId, msg.sender.userId);
        const ts = getCurrentTimeStamp(), td = getTodayUntilNow();
        cctx.push({role:"user",content:`from ${msg.sender.nickname}（QQ:${msg.sender.userId}）[${ts}|${td}s]: ${msg.message}`});
        cctx = truncateChaosContext(cctx);

        // 构造请求
        const tempVal = (() => { try { return new DeepseekAI(msg.sender.userId).getTemperature(); } catch(e) { return 1.3; } })();
        const body = {
            model: getConfigValue("大模型模型名","deepseek-v4-flash"),
            messages: cctx,
            max_tokens: parseInt(getConfigValue("最大回复tokens数","600"))||600,
            temperature: tempVal,
            stream: false
        };
        if (getConfigValue("思考模式开关",false)) {
            body.reasoning_effort = getConfigValue("思考强度","high");
            body.extra_body = {thinking:{type:"enabled"}};
        }

        try {
            const resp = await fetch(getConfigValue("大模型url","https://api.deepseek.com/v1/chat/completions"),{method:"POST",headers:{Authorization:`Bearer ${getConfigValue("你的APIkeys","")}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
            if (!resp.ok) { console.error(`[随机插话] HTTP ${resp.status}: ${await resp.text()}`); return false; }
            const data = await resp.json();
            if (!data.choices?.[0]?.message) { console.error(`[随机插话] 响应无 choices`); return false; }
            const reply = data.choices[0].message.content;

            // 更新插话上下文（写入 user + assistant 轮次）
            let nc = ensureChaosSystem(groupId, msg.sender.userId);
            nc.push({role:"user",content:`from ${msg.sender.nickname}（QQ:${msg.sender.userId}）[${ts}|${td}s]: ${msg.message}`});
            nc.push({role:"assistant",content:reply});
            nc = truncateChaosContext(nc);
            saveChaosContext(groupId, nc);

            // 异步更新插话摘要
            generateChaosSummaryAsync(groupId);

            // 成功触发后重置剩余计数为 N
            chaosState.remain[groupId] = N;
            saveChaosState();

            seal.replyToSender(ctx, msg, parseMarkdown(reply).replace(/from .+?: /g,""));
            return true;
        } catch (e) { console.error(`[随机插话错误] ${groupId}:`, e); }
        return false;
    }

    // ==================== 指令定义（使用 seal.ext.registerCmd 注册，确保 1.6.0 指令可被识别） ====================
    function registerCmd(cmdItem) {
        try {
            if (typeof seal.ext.registerCmd === 'function') {
                seal.ext.registerCmd(ext, cmdItem);
            } else {
                // 兜底：写入 cmdMap
                ext.cmdMap = ext.cmdMap || {};
                ext.cmdMap[cmdItem.name] = cmdItem;
            }
        } catch (e) { console.error(`[指令注册失败] ${cmdItem.name}:`, e); }
    }

    const cmdReset = seal.ext.newCmdItemInfo(); cmdReset.name="重置AI"; cmdReset.help="重置AI对话上下文（保留摘要）"; cmdReset.solve=(ctx,msg)=>{new DeepseekAI(msg.sender.userId)._resetConversation(false);seal.replyToSender(ctx,msg,"已重置对话上下文（摘要已保留）");}; registerCmd(cmdReset);
    const cmdResetSummary = seal.ext.newCmdItemInfo(); cmdResetSummary.name="重置摘要"; cmdResetSummary.help="重置对话摘要（保留对话上下文）"; cmdResetSummary.solve=(ctx,msg)=>seal.replyToSender(ctx,msg,new DeepseekAI(msg.sender.userId).resetSummary()); registerCmd(cmdResetSummary);
    const cmdResetAll = seal.ext.newCmdItemInfo(); cmdResetAll.name="重置全部"; cmdResetAll.help="同时重置对话上下文和摘要"; cmdResetAll.solve=(ctx,msg)=>{new DeepseekAI(msg.sender.userId)._resetConversation(true);seal.replyToSender(ctx,msg,"已重置对话上下文和摘要");}; registerCmd(cmdResetAll);
    const cmdCheck = seal.ext.newCmdItemInfo(); cmdCheck.name="检查对话"; cmdCheck.help="检查当前对话状态"; cmdCheck.solve=(ctx,msg)=>{const ai=new DeepseekAI(msg.sender.userId);const v=ai._validateContext(ai.context);const s=ai.loadSummary();seal.replyToSender(ctx,msg,v?`当前对话状态正常\n摘要状态: ${s.content?"已生成":"未生成"}`:"对话数据异常，建议使用【重置AI】");}; registerCmd(cmdCheck);
    const cmdUpdateRole = seal.ext.newCmdItemInfo(); cmdUpdateRole.name="更新角色"; cmdUpdateRole.help="更新系统角色为最新配置"; cmdUpdateRole.solve=(ctx,msg)=>{new DeepseekAI(msg.sender.userId).updateSystemContext();seal.replyToSender(ctx,msg,"系统角色已更新为最新配置");}; registerCmd(cmdUpdateRole);
    const cmdContextStatus = seal.ext.newCmdItemInfo(); cmdContextStatus.name="上下文状态"; cmdContextStatus.help="查看当前保存的对话轮数"; cmdContextStatus.solve=(ctx,msg)=>{const ai=new DeepseekAI(msg.sender.userId);const r=Math.max(0,(ai.context.length-1)/2);seal.replyToSender(ctx,msg,`当前保存: ${r}轮对话（最大${getConfigValue("存储上下文对话限制轮数","16")}轮）`);}; registerCmd(cmdContextStatus);
    const cmdViewSummary = seal.ext.newCmdItemInfo(); cmdViewSummary.name="查看摘要"; cmdViewSummary.help="查看当前的对话摘要"; cmdViewSummary.solve=(ctx,msg)=>seal.replyToSender(ctx,msg,`对话摘要信息:\n${new DeepseekAI(msg.sender.userId).viewSummary()}`); registerCmd(cmdViewSummary);
    const cmdUpdateSummary = seal.ext.newCmdItemInfo(); cmdUpdateSummary.name="更新摘要"; cmdUpdateSummary.help="手动更新对话摘要"; cmdUpdateSummary.solve=async(ctx,msg)=>seal.replyToSender(ctx,msg,await new DeepseekAI(msg.sender.userId).updateSummary()); registerCmd(cmdUpdateSummary);
    const cmdViewTemperature = seal.ext.newCmdItemInfo(); cmdViewTemperature.name="查看Temperature"; cmdViewTemperature.help="查看当前的Temperature设置"; cmdViewTemperature.solve=(ctx,msg)=>{const t=new DeepseekAI(msg.sender.userId).getTemperature();seal.replyToSender(ctx,msg,`当前Temperature: ${t}\n推荐设置:\n0.0 - 代码生成/数学解题\n1.0 - 数据抽取/分析\n1.3 - 通用对话/翻译\n1.5 - 创意类写作/诗歌创作`);}; registerCmd(cmdViewTemperature);
    const cmdSetTemperature = seal.ext.newCmdItemInfo(); cmdSetTemperature.name="设置Temperature"; cmdSetTemperature.help="设置Temperature值 (0.0-2.0)"; cmdSetTemperature.solve=(ctx,msg,cmdArgs)=>{const v=cmdArgs.getArgN(1);if(!v){seal.replyToSender(ctx,msg,"请提供Temperature值，例如: .设置Temperature 1.3");return;}const t=parseFloat(v);if(isNaN(t)||t<0||t>2){seal.replyToSender(ctx,msg,"Temperature值必须在0.0到2.0之间");return;}seal.ext.registerStringConfig(ext,"Temperature",t.toString(),"Temperature设置 (0.0-2.0)","基础设置");seal.replyToSender(ctx,msg,`Temperature已设置为: ${t}\n推荐设置:\n0.0 - 代码/数学\n1.0 - 数据抽取\n1.3 - 通用对话\n1.5 - 创意写作`);}; registerCmd(cmdSetTemperature);
    const cmdViewThinking = seal.ext.newCmdItemInfo(); cmdViewThinking.name="查看思考模式"; cmdViewThinking.help="查看当前的思考模式状态"; cmdViewThinking.solve=(ctx,msg)=>seal.replyToSender(ctx,msg,`思考模式: ${getConfigValue("思考模式开关",false)?"开启":"关闭"}\n思考强度: ${getConfigValue("思考强度","high")}`); registerCmd(cmdViewThinking);
    const cmdSetThinking = seal.ext.newCmdItemInfo(); cmdSetThinking.name="设置思考模式"; cmdSetThinking.help="设置思考模式 (on/off)"; cmdSetThinking.solve=(ctx,msg,cmdArgs)=>{const v=cmdArgs.getArgN(1);if(v==="on"){seal.ext.registerBoolConfig(ext,"思考模式开关",true,"思考模式开关（开/关）","基础设置");seal.replyToSender(ctx,msg,"思考模式已开启");}else if(v==="off"){seal.ext.registerBoolConfig(ext,"思考模式开关",false,"思考模式开关（开/关）","基础设置");seal.replyToSender(ctx,msg,"思考模式已关闭");}else seal.replyToSender(ctx,msg,"请使用: .设置思考模式 on 或 .设置思考模式 off");}; registerCmd(cmdSetThinking);
    const cmdSetEffort = seal.ext.newCmdItemInfo(); cmdSetEffort.name="设置思考强度"; cmdSetEffort.help="设置思考强度 (high/max)"; cmdSetEffort.solve=(ctx,msg,cmdArgs)=>{const v=cmdArgs.getArgN(1);if(v==="high"||v==="max"){seal.ext.registerOptionConfig(ext,"思考强度",v,["high","max"],"思考强度设置 (high/max)","基础设置");seal.replyToSender(ctx,msg,`思考强度已设置为: ${v}`);}else seal.replyToSender(ctx,msg,"请使用: .设置思考强度 high 或 .设置思考强度 max");}; registerCmd(cmdSetEffort);
    const cmdLibraryStatus = seal.ext.newCmdItemInfo(); cmdLibraryStatus.name="资料库状态"; cmdLibraryStatus.help="查看所有长文本资料库的状态"; cmdLibraryStatus.solve=(ctx,msg)=>{const stats=new DeepseekAI(msg.sender.userId).getLibraryStats();let s="资料库状态:\n\n";stats.forEach(st=>{s+=`【${st.configType}】\n配置项: ${st.name}\n内容长度: ${st.contentLength}字符\n状态: ${st.hasContent?"已配置":"未配置"}\n\n`;});seal.replyToSender(ctx,msg,s.trim());}; registerCmd(cmdLibraryStatus);
    const cmdUpdateLibrary = seal.ext.newCmdItemInfo(); cmdUpdateLibrary.name="更新资料库"; cmdUpdateLibrary.help="手动更新当前用户的资料库内容"; cmdUpdateLibrary.solve=(ctx,msg)=>{new DeepseekAI(msg.sender.userId).updateSystemContext(true);seal.replyToSender(ctx,msg,"当前用户的资料库已更新");}; registerCmd(cmdUpdateLibrary);

    // —— 随机插话指令（仅高权限）——
    const cmdChaosStatus = seal.ext.newCmdItemInfo(); cmdChaosStatus.name="随机插话状态"; cmdChaosStatus.help="查看随机插话功能状态（仅高权限）"; cmdChaosStatus.solve=(ctx,msg)=>{
        if (ctx.privilegeLevel < 100) { seal.replyToSender(ctx,msg,seal.formatTmpl(ctx,"核心:提示_无权限")); return; }
        const gid = ctx.isPrivate ? ctx.player.userId : ctx.group.groupId;
        const on = getConfigValue("随机插话开关",false);
        const N = parseInt(getConfigValue("随机插话每N条触发","5"))||5;
        const rem = (chaosState.remain[gid] === undefined) ? N : chaosState.remain[gid];
        const scope = ctx.isPrivate ? `私聊(${gid})` : `群聊(${gid})`;
        seal.replyToSender(ctx,msg,`随机插话功能: ${on?"已开启":"未开启"}\n当前作用域: ${scope}\n每 ${N} 条消息触发一次\n当前剩余消息条数: ${rem}\n（群聊上下文/摘要与个人对话数据独立存储）`);
    }; registerCmd(cmdChaosStatus);
    const cmdChaosOn = seal.ext.newCmdItemInfo(); cmdChaosOn.name="开启随机插话"; cmdChaosOn.help="开启随机插话功能（仅高权限）"; cmdChaosOn.solve=(ctx,msg)=>{
        if (ctx.privilegeLevel < 100) { seal.replyToSender(ctx,msg,seal.formatTmpl(ctx,"核心:提示_无权限")); return; }
        seal.ext.registerBoolConfig(ext,"随机插话开关",true,"随机插话功能开关（开/关，默认关）","随机插话设置");
        const gid = ctx.isPrivate ? ctx.player.userId : ctx.group.groupId;
        chaosState.remain[gid] = parseInt(getConfigValue("随机插话每N条触发","5"))||5;
        saveChaosState();
        seal.replyToSender(ctx,msg,getConfigValue("随机插话开启回复","随机插话已开启"));
    }; registerCmd(cmdChaosOn);
    const cmdChaosOff = seal.ext.newCmdItemInfo(); cmdChaosOff.name="关闭随机插话"; cmdChaosOff.help="关闭随机插话功能（仅高权限）"; cmdChaosOff.solve=(ctx,msg)=>{
        if (ctx.privilegeLevel < 100) { seal.replyToSender(ctx,msg,seal.formatTmpl(ctx,"核心:提示_无权限")); return; }
        seal.ext.registerBoolConfig(ext,"随机插话开关",false,"随机插话功能开关（开/关，默认关）","随机插话设置");
        seal.replyToSender(ctx,msg,getConfigValue("随机插话关闭回复","随机插话已关闭"));
    }; registerCmd(cmdChaosOff);
    const cmdViewChaosSummary = seal.ext.newCmdItemInfo(); cmdViewChaosSummary.name="查看插话摘要"; cmdViewChaosSummary.help="查看当前群聊的随机插话摘要（仅高权限）"; cmdViewChaosSummary.solve=(ctx,msg)=>{
        if (ctx.privilegeLevel < 100) { seal.replyToSender(ctx,msg,seal.formatTmpl(ctx,"核心:提示_无权限")); return; }
        const gid = ctx.isPrivate ? ctx.player.userId : ctx.group.groupId;
        const s = loadChaosSummary(gid);
        if (s.content && s.content.trim().length>0) seal.replyToSender(ctx,msg,`群聊(${gid}) 插话摘要:\n最后更新: ${s.lastUpdated}\n${s.content}`);
        else seal.replyToSender(ctx,msg,`群聊(${gid}) 暂无插话摘要`);
    }; registerCmd(cmdViewChaosSummary);

    // ==================== 触发与权限逻辑 ====================
    function checkAllowed(ctx) {
        const whiteOn = getConfigValue("白名单开关",false);
        if (!whiteOn) return true;
        const ag = getConfigValue("允许使用群号",[]); const ap = getConfigValue("允许使用私聊",[]);
        if (!ctx.isPrivate) return !ag||ag.length===0||ag.some(g=>String(g).includes(ctx.group.groupId.toString()));
        else return !ap||ap.length===0||ap.some(u=>String(u).includes(ctx.player.userId.toString()));
    }
    function isCommandMessage(msg){if(!msg||!msg.message)return false;const m=String(msg.message).trim();return m.charAt(0)==="."||m.charAt(0)==="。";}

    ext.onNotCommandReceived = async (ctx, msg) => {
        if (isCommandMessage(msg)) return;
        const gid = ctx.isPrivate ? ctx.player.userId : ctx.group.groupId;

        // —— 随机插话处理（开关开启 + 群聊/私聊均生效）——
        if (getConfigValue("随机插话开关",false)) {
            const N = parseInt(getConfigValue("随机插话每N条触发","5"))||5;
            // 初始化当前作用域计数
            if (typeof chaosState.remain[gid] !== 'number') { chaosState.remain[gid] = N; saveChaosState(); }
            // 每条消息都累积进插话上下文（供触发时作为完整上下文），同时计数递减
            let cctx = ensureChaosSystem(gid, msg.sender.userId);
            const ts = getCurrentTimeStamp(), td = getTodayUntilNow();
            cctx.push({role:"user",content:`from ${msg.sender.nickname}（QQ:${msg.sender.userId}）[${ts}|${td}s]: ${msg.message}`});
            cctx = truncateChaosContext(cctx);
            saveChaosContext(gid, cctx);

            chaosState.remain[gid] = (chaosState.remain[gid]||0) - 1;
            saveChaosState();
            await triggerChaos(ctx, msg, gid);
        }

        // —— 个人对话触发（关键词命中时，走个人上下文+个人摘要）——
        const keywords = getTriggerKeywords();
        if (keywords.length > 0 && keywords.some(kw => msg.message.includes(kw))) {
            if (!checkAllowed(ctx)) return;
            new DeepseekAI(msg.sender.userId).chat(msg.message, ctx, msg);
        }
    };

    // ==================== 帮助指令 ====================
    const cmdHelp = seal.ext.newCmdItemInfo(); cmdHelp.name="deepseekai"; cmdHelp.help="Deepseek AI插件帮助"; cmdHelp.solve=(ctx,msg)=>{
        const te=getConfigValue("思考模式开关",false);const t=new DeepseekAI(msg.sender.userId).getTemperature();
        let h="Deepseek AI插件 V4适配版 2.3.0 指令：\n\n";
        h+="思考模式控制:\n1. 查看思考模式 / 设置思考模式 on|off\n2. 设置思考强度 high|max\n3. 查看Temperature / 设置Temperature 0.0-2.0\n\n";
        h+="重置指令:\n4. 重置AI 5. 重置摘要 6. 重置全部\n\n";
        h+="基础指令:\n7. 检查对话 8. 更新角色 9. 上下文状态\n10. 查看摘要 11. 更新摘要 12. 资料库状态 13. 更新资料库\n\n";
        h+="随机插话（可选，默认关）:\n14. 开启随机插话 / 关闭随机插话 / 随机插话状态\n15. 查看插话摘要（仅高权限）\n\n";
        h+=`当前状态:\n思考模式: ${te?"开启":"关闭"} | 思考强度: ${getConfigValue("思考强度","high")}\n`;
        const kw=getTriggerKeywords();h+=`Temperature: ${t} | 触发关键词: ${kw.length>0?kw.join(" / "):"（未配置）"}\n`;
        h+=`随机插话: ${getConfigValue("随机插话开关",false)?"开启":"关闭"} | 每 ${getConfigValue("随机插话每N条触发","5")} 条触发一次\n`;
        h+="配置分组: 基础设置 / 个性配置 / 权限设置 / 随机插话设置\n版本: 2.3.0 (整合随机插话版，修复指令注册/群聊上下文累积/插话摘要)";
        seal.replyToSender(ctx,msg,h);
    };
    registerCmd(cmdHelp);

    console.log("[Deepseek AI插件加载完成] 版本 2.3.0 (整合随机插话功能，修复指令注册/群聊上下文累积/插话摘要，配置四分组，兼容旧数据)");
}
