// ==UserScript==
// @name         Deepseek AI Plugin
// @author       懒河
// @version      2.0.2
// @description  基于原本白鱼制作的插件的修改，完善了系统设定和对话存储，添加了指令功能，添加了Markdown过滤功能，使用.deepseekai查看相应指令。新增对话摘要功能优化记忆系统。新增Temperature配置功能。简化资料库存储。增强兼容性。
// @license      MIT
//@timestamp  2026/01/19
// @updateUrl    https://github.com/LoungingRiver/-SealDice-DeepSeek-Ai-Plugin.git
// @sealVersion  1.4.5
// ==/UserScript==

if (!seal.ext.find('deepseekai')) {
    const ext = seal.ext.new('deepseekai', 'lanhe', '2.0.2');
    seal.ext.register(ext);

    function registerConfigIfNotExists(configKey, defaultValue, description = "", options = {}) {
        const existingConfig = seal.ext.getConfig(ext, configKey);
        if (existingConfig !== null && existingConfig !== undefined) {
            console.log(`[DeepseekAI配置检测] 配置项 "${configKey}" 已存在，保留原有配置`);
            return existingConfig;
        }
        
        console.log(`[DeepseekAI配置注册] 注册新配置项 "${configKey}"`);
        if (Array.isArray(defaultValue)) {
            seal.ext.registerTemplateConfig(ext, configKey, defaultValue, description);
        } else {
            seal.ext.registerStringConfig(ext, configKey, defaultValue, description, options);
        }
        return defaultValue;
    }

    const configs = {
        "大模型url": "https://api.deepseek.com/v1/chat/completions",
        "大模型模型名": "deepseek-chat",
        "你的APIkeys": "sk-your-api-key-here",
        "最大回复tokens数": "600",
        "摘要生成最大tokens数": "1000",
        "存储上下文对话限制轮数": "16",
        "角色设定": "你是一个可爱的有鲨鱼尾巴的小女孩，主要用于测试，乐于为测试者提供一切需要的服务。在必要时应当回答包括已知的时间信息，摘要内容等相关的提问。",
        "非指令关键词": "小伊",
        "Temperature": "1.3",
        "摘要生成提示词": "请基于之前的对话摘要和最新的对话内容，更新对话摘要。保留重要信息，添加新内容，确保摘要的连贯性和完整性。",
        "full_library": "",
        "sub1_library": "",
        "sub2_library": "",
        "sub3_library": ""
    };
    
    Object.entries(configs).forEach(([key, val]) => {
        if (key.includes("_library")) {
            registerConfigIfNotExists(key, val, `${key}长文本资料库内容（支持多行文本）`, {
                type: "textarea",
                rows: 8,
                placeholder: `在此输入${key}的长文本资料库内容，支持多行输入...`,
                maxLength: 20000
            });
        } else {
            registerConfigIfNotExists(key, val);
        }
    });
    
    registerConfigIfNotExists("允许使用群号", ["QQ-Group:123456", "QQ-Group:654321"], "限制允许接收消息的群号");
    registerConfigIfNotExists("允许使用私聊", ["QQ:111111", "QQ:222222"], "限制允许接收消息的私聊");

    function getCurrentTimeStamp() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    function getTodayUntilNow() {
        const now = new Date();
        return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    }

    function parseMarkdown(text) {
        if (!text) return "";
        
        const codeBlocks = [];
        text = text.replace(/```(json)?([\s\S]*?)```/g, (match, isJson, content) => {
            const block = {
                type: isJson ? 'json' : 'code',
                content: content.trim()
            };
            codeBlocks.push(block);
            return `\`\`\`${isJson || ''}\n${content}\n\`\`\``;
        });

        text = text.replace(/`([^`]+)`/g, '$1');
        text = text.replace(/!\[.*?\]\(.*?\)/g, '');
        text = text.replace(/\[(.*?)\]\(.*?\)/g, '$1');
        text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
        text = text.replace(/(\*|_)(.*?)\1/g, '$2');
        text = text.replace(/^#+\s+/gm, '');
        text = text.replace(/^>\s+/gm, '');
        text = text.replace(/^[\*\-\+]\s+/gm, '');
        text = text.replace(/^\|.*?\|$/gm, '');
        text = text.replace(/^[-*_]{3,}$/gm, '');
        text = text.replace(/<[^>]+>/g, '');
        text = text.replace(/\n{3,}/g, '\n\n');

        return text.trim();
    }
    class DeepseekAI {
        constructor(userId) {
            this.userId = userId;
            this.context = [];
            this.loadContext();
            this.initializeSummarySystem();
            console.log(`[DeepseekAI初始化] 用户 ${userId} AI实例创建完成`);
        }

        initializeSummarySystem() {
            try {
                const summary = this.loadSummary();
                const hasOldData = this.context && this.context.length > 0;
                const hasValidSummary = summary.content && summary.content.trim().length > 0;
                
                console.log(`[摘要系统初始化] 用户 ${this.userId} 摘要初始化: 有旧数据=${hasOldData}, 有有效摘要=${hasValidSummary}`);
                
                if (hasOldData && !hasValidSummary && this.context.length > 3) {
                    console.log(`[摘要系统初始化] 为用户 ${this.userId} 生成初始摘要`);
                    this.generateInitialSummarySync();
                } else if (hasValidSummary) {
                    this.updateSystemContext();
                    console.log(`[摘要系统初始化] 用户 ${this.userId} 使用现有摘要`);
                }
            } catch (e) {
                console.error(`[摘要系统初始化错误] 用户 ${this.userId}:`, e);
            }
        }

        generateInitialSummarySync() {
            try {
                const recentMessages = this.context.slice(-4);
                if (recentMessages.length === 0) return;
                
                let summaryContent = "历史对话包含以下内容：";
                const keyTopics = [];
                
                for (const msg of recentMessages) {
                    if (msg.role === "user") {
                        const content = msg.content.replace(/from .+?\[.+?\]: /, '');
                        if (content.length > 10) {
                            keyTopics.push(content.substring(0, 50) + (content.length > 50 ? "..." : ""));
                        }
                    }
                }
                
                if (keyTopics.length > 0) {
                    summaryContent += keyTopics.slice(0, 3).join("；");
                    this.saveSummary(summaryContent);
                    this.updateSystemContext();
                    console.log(`[初始摘要生成] 用户 ${this.userId} 初始摘要生成成功`);
                }
            } catch (error) {
                console.error(`[初始摘要生成错误] 用户 ${this.userId}:`, error);
                this.saveSummary("开始新的对话");
                this.updateSystemContext();
            }
        }

        getSummaryKey() {
            return `${this.userId}_summary`;
        }

        loadSummary() {
            try {
                const saved = ext.storageGet(this.getSummaryKey());
                if (saved) {
                    let parsed;
                    if (typeof saved === 'string') {
                        try {
                            parsed = JSON.parse(saved);
                        } catch (e) {
                            return {
                                content: saved,
                                lastUpdated: getCurrentTimeStamp(),
                                version: "1.0"
                            };
                        }
                    } else {
                        parsed = saved;
                    }
                    
                    if (parsed && typeof parsed.content === 'string') {
                        return {
                            content: parsed.content || "",
                            lastUpdated: parsed.lastUpdated || getCurrentTimeStamp(),
                            version: parsed.version || "1.0"
                        };
                    }
                }
            } catch (e) {
                console.error(`[摘要加载错误] 用户 ${this.userId}:`, e);
            }
            
            return {
                content: "",
                lastUpdated: getCurrentTimeStamp(),
                version: "1.0"
            };
        }

        saveSummary(summaryContent) {
            const summary = {
                content: summaryContent || "",
                lastUpdated: getCurrentTimeStamp(),
                version: "1.0"
            };
            ext.storageSet(this.getSummaryKey(), JSON.stringify(summary));
            console.log(`[摘要保存] 用户 ${this.userId} 摘要已保存: ${summaryContent.substring(0, 50)}...`);
        }

        updateSystemContext() {
            try {
                const systemContent = seal.ext.getStringConfig(ext, "角色设定");
                const summary = this.loadSummary();
                
                let enhancedSystemContent = systemContent;
                if (summary.content && summary.content.trim().length > 0) {
                    const cleanSummary = summary.content.trim();
                    enhancedSystemContent = `${systemContent}\n\n【先前对话摘要】\n${cleanSummary}\n——————————\n`;
                    console.log(`[系统上下文更新] 用户 ${this.userId} 系统提示词已包含摘要，长度: ${enhancedSystemContent.length}`);
                } else {
                    console.log(`[系统上下文更新] 用户 ${this.userId} 系统提示词不包含摘要`);
                }
                
                if (!this.context || !this._validateContext(this.context)) {
                    console.log(`[系统上下文更新] 用户 ${this.userId} 上下文数据异常，进行重置`);
                    this._resetConversation();
                    return;
                }
                
                this._ensureSystemMessage(enhancedSystemContent);
                ext.storageSet(this.userId, JSON.stringify(this.context));
            } catch (e) {
                console.error(`[系统上下文更新错误] 用户 ${this.userId}:`, e);
            }
        }

        _ensureSystemMessage(systemContent) {
            if (!this.context || this.context.length === 0) {
                this.context = [{
                    role: "system",
                    content: systemContent
                }];
                return;
            }
            
            if (this.context[0] && this.context[0].role === "system") {
                this.context[0].content = systemContent;
            } else {
                this.context.unshift({
                    role: "system",
                    content: systemContent
                });
            }
        }

        _validateContext(data) {
            try {
                if (!Array.isArray(data)) return false;
                if (data.length === 0) return false;
                return data.every(msg => msg && typeof msg === 'object' && msg.role && msg.content);
            } catch (e) {
                return false;
            }
        }

        _isOldDataFormat(data) {
            if (!Array.isArray(data)) return false;
            for (const msg of data) {
                if (msg.role === "user" && msg.content) {
                    if (msg.content.includes('): ') && !msg.content.includes(')[')) {
                        return true;
                    }
                }
            }
            return false;
        }

        _migrateOldData(oldData) {
            console.log(`[数据迁移] 为用户 ${this.userId} 迁移旧数据格式`);
            try {
                if (!Array.isArray(oldData)) {
                    return this._createNewConversation();
                }
                
                const migratedContext = [];
                let hasSystemMsg = false;
                
                for (const msg of oldData) {
                    if (msg.role === "system") {
                        hasSystemMsg = true;
                        migratedContext.push(msg);
                    }
                }
                
                if (!hasSystemMsg) {
                    migratedContext.unshift({
                        role: "system",
                        content: seal.ext.getStringConfig(ext, "角色设定")
                    });
                }
                
                for (const msg of oldData) {
                    if (msg.role !== "system") {
                        if (msg.role === "user" && !msg.content.includes('[')) {
                            const timestamp = getCurrentTimeStamp();
                            const todaySec = getTodayUntilNow();
                            const migratedMsg = {
                                role: msg.role,
                                content: this._addTimestampToOldMessage(msg.content, timestamp, todaySec)
                            };
                            migratedContext.push(migratedMsg);
                        } else {
                            migratedContext.push(msg);
                        }
                    }
                }
                
                return migratedContext;
            } catch (e) {
                console.error(`[数据迁移错误] 用户 ${this.userId}:`, e);
                return this._createNewConversation();
            }
        }

        _addTimestampToOldMessage(oldContent, timestamp, todaySec) {
            if (oldContent.startsWith('from ') && oldContent.includes('): ')) {
                const parts = oldContent.split('): ');
                if (parts.length === 2) {
                    return `${parts[0]})[${timestamp}|${todaySec}s]: ${parts[1]}`;
                }
            }
            return `from 系统（QQ:${this.userId}）[${timestamp}|${todaySec}s]: ${oldContent}`;
        }

        _createNewConversation() {
            const timestamp = getCurrentTimeStamp();
            const todaySec = getTodayUntilNow();
            return [
                {
                    role: "system",
                    content: seal.ext.getStringConfig(ext, "角色设定")
                },
                {
                    role: "user",
                    content: `from 新用户（QQ:${this.userId}）[${timestamp}|${todaySec}s]: 你好`
                },
                {
                    role: "assistant", 
                    content: "准备好啦~"
                }
            ];
        }

        _resetConversation() {
            const timestamp = getCurrentTimeStamp();
            const todaySec = getTodayUntilNow();
            this.context = [
                {
                    role: "system",
                    content: seal.ext.getStringConfig(ext, "角色设定")
                },
                {
                    role: "user",
                    content: `from 系统（QQ:${this.userId}）[${timestamp}|${todaySec}s]: 对话已重置`
                },
                {
                    role: "assistant",
                    content: "检测到问题，已自动重置对话~"
                }
            ];
            this.saveSummary("");
            ext.storageSet(this.userId, JSON.stringify(this.context));
            console.log(`[对话重置] 用户 ${this.userId} 对话和摘要已重置`);
        }

        loadContext() {
            try {
                const saved = ext.storageGet(this.userId);
                
                if (saved) {
                    let parsed;
                    if (typeof saved === 'string') {
                        try {
                            parsed = JSON.parse(saved);
                        } catch (e) {
                            parsed = null;
                        }
                    } else {
                        parsed = saved;
                    }
                    
                    if (this._validateContext(parsed)) {
                        if (this._isOldDataFormat(parsed)) {
                            console.log(`[数据兼容] 检测到用户 ${this.userId} 的旧数据格式，进行迁移`);
                            this.context = this._migrateOldData(parsed);
                            ext.storageSet(this.userId, JSON.stringify(this.context));
                        } else {
                            this.context = parsed;
                        }
                        console.log(`[上下文加载] 用户 ${this.userId} 上下文加载成功，轮数: ${(this.context.length - 1) / 2}`);
                        return;
                    } else {
                        console.log(`[数据修复] 用户 ${this.userId} 的数据格式无效，进行修复`);
                    }
                }

                this.context = this._createNewConversation();
                ext.storageSet(this.userId, JSON.stringify(this.context));
                console.log(`[新对话创建] 用户 ${this.userId} 创建新对话`);

            } catch (e) {
                console.error(`[上下文加载错误] 用户 ${this.userId}:`, e);
                this.context = this._createNewConversation();
                ext.storageSet(this.userId, JSON.stringify(this.context));
            }
        }

        _enforceRules() {
            const maxRounds = parseInt(seal.ext.getStringConfig(ext, "存储上下文对话限制轮数")) || 4;
            const maxMessages = maxRounds * 2;
            
            if (this.context.length > maxMessages + 1) {
                const latestSystemMsg = this.context.find(msg => msg.role === "system") || 
                    { role: "system", content: seal.ext.getStringConfig(ext, "角色设定") };
                
                this.context = [
                    latestSystemMsg,
                    ...this.context.slice(-maxMessages)
                ];
                ext.storageSet(this.userId, JSON.stringify(this.context));
                console.log(`[规则执行] 用户 ${this.userId} 上下文已裁剪至最大 ${maxRounds} 轮对话`);
            }
        }

        getTemperature() {
            const tempStr = seal.ext.getStringConfig(ext, "Temperature");
            const temp = parseFloat(tempStr);
            return isNaN(temp) ? 1.3 : Math.max(0.0, Math.min(2.0, temp));
        }

        parseLibraryContent(libraryName) {
            const content = seal.ext.getStringConfig(ext, libraryName) || "";
            return content.trim();
        }

        getLibraryType(libraryName) {
            const typeMap = {
                "full_library": "完整资料库",
                "sub1_library": "子资料库1",
                "sub2_library": "子资料库2", 
                "sub3_library": "子资料库3"
            };
            return typeMap[libraryName] || "通用资料";
        }

        getAllLibrariesContent() {
            const libraries = ["full_library", "sub1_library", "sub2_library", "sub3_library"];
            let result = "";
            
            for (const libName of libraries) {
                const content = this.parseLibraryContent(libName);
                if (content) {
                    const libType = this.getLibraryType(libName);
                    result += `【${libType}】\n${content}\n\n`;
                }
            }
            
            return result.trim();
        }

        getLibraryStats() {
            const libraries = ["full_library", "sub1_library", "sub2_library", "sub3_library"];
            const stats = [];
            
            for (const libName of libraries) {
                const content = this.parseLibraryContent(libName);
                stats.push({
                    name: libName,
                    configType: this.getLibraryType(libName),
                    contentLength: content.length,
                    hasContent: content.length > 0
                });
            }
            
            return stats;
        }

        async chat(text, ctx, msg) {
            this.updateSystemContext();
            
            if (!this._validateContext(this.context)) {
                this._resetConversation();
            }

            const timestamp = getCurrentTimeStamp();
            const todaySec = getTodayUntilNow();
            
            this.context.push({
                role: "user",
                content: `from ${msg.sender.nickname}（QQ:${msg.sender.userId}）[${timestamp}|${todaySec}s]: ${text}`
            });
            
            this._enforceRules();

            try {
                const messagesToSend = [...this.context];
                
                const systemMsgIndex = messagesToSend.findIndex(msg => msg.role === "system");
                if (systemMsgIndex !== -1) {
                    const libraryContent = this.getAllLibrariesContent();
                    if (libraryContent) {
                        messagesToSend[systemMsgIndex] = {
                            ...messagesToSend[systemMsgIndex],
                            content: messagesToSend[systemMsgIndex].content + "\n\n" + libraryContent
                        };
                        console.log(`[资料库注入] 用户 ${this.userId} 已注入资料库内容，长度: ${libraryContent.length}`);
                    }
                }

                console.log(`[API请求] 用户 ${this.userId} 发送消息，Temperature: ${this.getTemperature()}`);
                
                const resp = await fetch(seal.ext.getStringConfig(ext, "大模型url"), {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${seal.ext.getStringConfig(ext, "你的APIkeys")}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: seal.ext.getStringConfig(ext, "大模型模型名"),
                        messages: messagesToSend,
                        max_tokens: parseInt(seal.ext.getStringConfig(ext, "最大回复tokens数")) || 100,
                        temperature: this.getTemperature()
                    })
                });
                
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                
                const data = await resp.json();
                if (data.choices?.[0]?.message) {
                    const reply = data.choices[0].message.content;
                    const cleanReply = parseMarkdown(reply);
                    this.context.push({ 
                        role: "assistant", 
                        content: reply
                    });
                    
                    ext.storageSet(this.userId, JSON.stringify(this.context));
                    this.generateSummaryAsync();
                    
                    console.log(`[对话成功] 用户 ${this.userId} 收到回复，长度: ${cleanReply.length}`);
                    return seal.replyToSender(ctx, msg, cleanReply.replace(/from .+?: /g, ""));
                }
                throw new Error("Invalid API response");
                
            } catch (error) {
                console.error(`[对话错误] 用户 ${this.userId}:`, error);
                this._resetConversation();
                return seal.replyToSender(ctx, msg, `请求失败: ${error.message}\n已自动重置对话，请重试`);
            }
        }

        async generateSummaryAsync() {
            if (this.context.length < 4) return;
            
            setTimeout(async () => {
                try {
                    const previousSummary = this.loadSummary();
                    const recentMessages = this.context.slice(-6);
                    
                    let summaryPrompt = [];
                    
                    if (previousSummary.content && previousSummary.content.trim().length > 0) {
                        summaryPrompt.push({
                            role: "system",
                            content: `之前的对话摘要：${previousSummary.content}\n\n请基于这个摘要和最新的对话内容，更新对话摘要。`
                        });
                    }
                    
                    summaryPrompt = [
                        ...summaryPrompt,
                        ...recentMessages,
                        {
                            role: "user",
                            content: seal.ext.getStringConfig(ext, "摘要生成提示词")
                        }
                    ];

                    console.log(`[摘要生成] 用户 ${this.userId} 生成新摘要，基于之前摘要: ${previousSummary.content ? "是" : "否"}`);

                    const resp = await fetch(seal.ext.getStringConfig(ext, "大模型url"), {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${seal.ext.getStringConfig(ext, "你的APIkeys")}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            model: seal.ext.getStringConfig(ext, "大模型模型名"),
                            messages: summaryPrompt,
                            max_tokens: parseInt(seal.ext.getStringConfig(ext, "摘要生成最大tokens数")) || 300,
                            temperature: 0.3
                        })
                    });
                    
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data.choices?.[0]?.message) {
                            const newSummary = data.choices[0].message.content.trim();
                            this.saveSummary(newSummary);
                            this.updateSystemContext();
                            console.log(`[摘要生成成功] 用户 ${this.userId} 摘要更新成功`);
                        }
                    }
                } catch (error) {
                    console.error(`[摘要生成错误] 用户 ${this.userId}:`, error);
                }
            }, 500);
        }

        viewSummary() {
            const summary = this.loadSummary();
            if (summary.content && summary.content.trim().length > 0) {
                return `最后更新: ${summary.lastUpdated}\n对话摘要: ${summary.content}`;
            }
            return "暂无对话摘要";
        }

        async updateSummary() {
            try {
                await this.generateSummaryAsync();
                return "对话摘要已更新";
            } catch (error) {
                console.error(`[手动摘要更新错误] 用户 ${this.userId}:`, error);
                return "摘要更新失败";
            }
        }
    }

    // 指令注册部分
    const cmdReset = seal.ext.newCmdItemInfo();
    cmdReset.name = "重置AI";
    cmdReset.help = "重置AI对话上下文和摘要";
    cmdReset.solve = (ctx, msg) => {
        new DeepseekAI(msg.sender.userId)._resetConversation();
        seal.replyToSender(ctx, msg, "已重置对话和摘要");
    };

    const cmdCheck = seal.ext.newCmdItemInfo();
    cmdCheck.name = "检查对话";
    cmdCheck.help = "检查当前对话状态";
    cmdCheck.solve = (ctx, msg) => {
        const ai = new DeepseekAI(msg.sender.userId);
        const isValid = ai._validateContext(ai.context);
        const summary = ai.loadSummary();
        seal.replyToSender(ctx, msg, isValid ? 
            `当前对话状态正常\n摘要状态: ${summary.content ? "已生成" : "未生成"}` : 
            "对话数据异常，建议使用【重置AI】");
    };

    const cmdUpdateRole = seal.ext.newCmdItemInfo();
    cmdUpdateRole.name = "更新角色";
    cmdUpdateRole.help = "更新系统角色为最新配置";
    cmdUpdateRole.solve = (ctx, msg) => {
        const ai = new DeepseekAI(msg.sender.userId);
        ai.updateSystemContext();
        seal.replyToSender(ctx, msg, "系统角色已更新为最新配置");
    };

    const cmdContextStatus = seal.ext.newCmdItemInfo();
    cmdContextStatus.name = "上下文状态";
    cmdContextStatus.help = "查看当前保存的对话轮数";
    cmdContextStatus.solve = (ctx, msg) => {
        const ai = new DeepseekAI(msg.sender.userId);
        const rounds = Math.max(0, (ai.context.length - 1) / 2);
        seal.replyToSender(ctx, msg, `当前保存: ${rounds}轮对话（最大${seal.ext.getStringConfig(ext, "存储上下文对话限制轮数")}轮）`);
    };

    const cmdViewSummary = seal.ext.newCmdItemInfo();
    cmdViewSummary.name = "查看摘要";
    cmdViewSummary.help = "查看当前的对话摘要";
    cmdViewSummary.solve = (ctx, msg) => {
        const ai = new DeepseekAI(msg.sender.userId);
        const summaryInfo = ai.viewSummary();
        seal.replyToSender(ctx, msg, `对话摘要信息:\n${summaryInfo}`);
    };

    const cmdUpdateSummary = seal.ext.newCmdItemInfo();
    cmdUpdateSummary.name = "更新摘要";
    cmdUpdateSummary.help = "手动更新对话摘要";
    cmdUpdateSummary.solve = async (ctx, msg) => {
        const ai = new DeepseekAI(msg.sender.userId);
        const result = await ai.updateSummary();
        seal.replyToSender(ctx, msg, `${result}`);
    };

    const cmdViewTemperature = seal.ext.newCmdItemInfo();
    cmdViewTemperature.name = "查看Temperature";
    cmdViewTemperature.help = "查看当前的Temperature设置";
    cmdViewTemperature.solve = (ctx, msg) => {
        const ai = new DeepseekAI(msg.sender.userId);
        const currentTemp = ai.getTemperature();
        seal.replyToSender(ctx, msg, `当前Temperature: ${currentTemp}\n推荐设置:\n0.0 - 代码生成/数学解题\n1.0 - 数据抽取/分析\n1.3 - 通用对话/翻译\n1.5 - 创意类写作/诗歌创作`);
    };

    const cmdSetTemperature = seal.ext.newCmdItemInfo();
    cmdSetTemperature.name = "设置Temperature";
    cmdSetTemperature.help = "设置Temperature值 (0.0-2.0)";
    cmdSetTemperature.solve = (ctx, msg, cmdArgs) => {
        const tempValue = cmdArgs.getArgN(1);
        if (!tempValue) {
            seal.replyToSender(ctx, msg, "请提供Temperature值，例如: .设置Temperature 1.3");
            return;
        }
        
        const temp = parseFloat(tempValue);
        if (isNaN(temp) || temp < 0.0 || temp > 2.0) {
            seal.replyToSender(ctx, msg, "Temperature值必须在0.0到2.0之间");
            return;
        }
        
        seal.ext.registerStringConfig(ext, "Temperature", tempValue.toString(), "Temperature设置 (0.0-2.0)");
        seal.replyToSender(ctx, msg, `Temperature已设置为: ${temp}\n推荐设置:\n0.0 - 代码生成/数学解题\n1.0 - 数据抽取/分析\n1.3 - 通用对话/翻译\n1.5 - 创意类写作/诗歌创作`);
    };

    const cmdLibraryStatus = seal.ext.newCmdItemInfo();
    cmdLibraryStatus.name = "资料库状态";
    cmdLibraryStatus.help = "查看所有长文本资料库的状态";
    cmdLibraryStatus.solve = (ctx, msg) => {
        const ai = new DeepseekAI(msg.sender.userId);
        const libraryStats = ai.getLibraryStats();
        
        let statusMsg = "资料库状态:\n\n";
        
        libraryStats.forEach(stat => {
            statusMsg += `【${stat.configType}】\n`;
            statusMsg += `配置项: ${stat.name}\n`;
            statusMsg += `内容长度: ${stat.contentLength}字符\n`;
            statusMsg += `状态: ${stat.hasContent ? "已配置" : "未配置"}\n\n`;
        });
        
        seal.replyToSender(ctx, msg, statusMsg.trim());
    };

    // 指令映射注册
    ext.cmdMap = ext.cmdMap || {};
    ext.cmdMap["重置AI"] = cmdReset;
    ext.cmdMap["检查对话"] = cmdCheck;
    ext.cmdMap["更新角色"] = cmdUpdateRole;
    ext.cmdMap["上下文状态"] = cmdContextStatus;
    ext.cmdMap["查看摘要"] = cmdViewSummary;
    ext.cmdMap["更新摘要"] = cmdUpdateSummary;
    ext.cmdMap["查看Temperature"] = cmdViewTemperature;
    ext.cmdMap["设置Temperature"] = cmdSetTemperature;
    ext.cmdMap["资料库状态"] = cmdLibraryStatus;

    // 非指令处理
    ext.onNotCommandReceived = (ctx, msg) => {
        const allowedGroups = seal.ext.getTemplateConfig(ext, "允许使用群号");
        const allowedPrivateChats = seal.ext.getTemplateConfig(ext, "允许使用私聊");
        
        let isAllowed = false;
        if (!ctx.isPrivate) {
            isAllowed = !allowedGroups || allowedGroups.length === 0 || 
                allowedGroups.some(group => group.includes(ctx.group.groupId.toString()));
        } else {
            isAllowed = !allowedPrivateChats || allowedPrivateChats.length === 0 || 
                allowedPrivateChats.some(user => user.includes(ctx.player.userId.toString()));
        }
        
        if (isAllowed && msg.message.includes(seal.ext.getStringConfig(ext, "非指令关键词"))) {
            console.log(`[非指令触发] 用户 ${msg.sender.userId} 触发关键词: ${seal.ext.getStringConfig(ext, "非指令关键词")}`);
            new DeepseekAI(msg.sender.userId).chat(msg.message, ctx, msg);
        }
    };

    const cmdHelp = seal.ext.newCmdItemInfo();
    cmdHelp.name = "deepseekai";
    cmdHelp.help = "Deepseek AI插件帮助";
    cmdHelp.solve = (ctx, msg) => {
        const ai = new DeepseekAI(msg.sender.userId);
        const currentTemp = ai.getTemperature();
        const libraryStats = ai.getLibraryStats();
        
        let helpMsg = "Deepseek AI插件指令：\n\n";
        helpMsg += "基础指令:\n";
        helpMsg += "1. 重置AI - 重置对话上下文和摘要\n";
        helpMsg += "2. 检查对话 - 检查当前对话状态\n";
        helpMsg += "3. 更新角色 - 更新系统角色设定\n";
        helpMsg += "4. 上下文状态 - 查看保存的对话轮数\n";
        helpMsg += "5. 查看摘要 - 查看当前的对话摘要\n";
        helpMsg += "6. 更新摘要 - 手动更新对话摘要\n";
        helpMsg += "7. 查看Temperature - 查看当前Temperature设置\n";
        helpMsg += "8. 设置Temperature - 设置Temperature值 (0.0-2.0)\n";
        helpMsg += "9. 资料库状态 - 查看资料库配置状态\n\n";
        helpMsg += `当前状态:\n`;
        helpMsg += `Temperature: ${currentTemp}\n`;
        helpMsg += `资料库数量: ${libraryStats.length}个\n`;
        
        // 显示每个资料库的状态
        libraryStats.forEach(stat => {
            const status = stat.hasContent ? "已配置" : "未配置";
            helpMsg += `${stat.configType}: ${stat.contentLength}字符 [${status}]\n`;
        });
        
        helpMsg += `触发词: ${seal.ext.getStringConfig(ext, "非指令关键词")}\n`;
        helpMsg += "版本: 2.0.2 (增强兼容性版)";
        seal.replyToSender(ctx, msg, helpMsg);
    };
    ext.cmdMap["deepseekai"] = cmdHelp;

    console.log("Deepseek AI插件加载完成，版本 2.0.2 (增强兼容性版)")
}