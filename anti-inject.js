/**
 * 反注入防护脚本
 * 防止托管平台注入广告、logo等无关内容
 * 原理：MutationObserver 监听DOM变化 + 定时清理 + CSP拦截脚本
 */
(function () {
    'use strict';

    // 已知的注入特征（属性名、类名、ID、链接域名包含这些关键词的元素将被移除）
    var INJECT_KEYWORDS = ['shangma', 'upma', 'branding', 'report-modal', 'micro-widget', 'widget-ad', 'widget-brand'];

    // 已知的注入域名（链接指向这些域名的元素将被移除）
    var INJECT_DOMAINS = ['upma.cn', 'upma.com', 'shangma'];

    // 页面自身的合法顶层元素选择器（body直接子元素中允许保留的）
    var ALLOWED_ROOT_SELECTORS = ['.container', 'script[src="data_handle.js"]', 'script[src="app.js"]', 'script[src="anti-inject.js"]', 'script[src="sqlhub-token.js"]'];

    // 是否正在清理中（防止MutationObserver递归触发）
    var isCleaning = false;

    /**
     * 判断元素是否是注入内容
     */
    function isInjected(el) {
        if (!el || el.nodeType !== 1) return false;

        var tagName = el.tagName.toLowerCase();

        // 处理 script 标签
        if (tagName === 'script') {
            var src = el.getAttribute('src') || '';
            if (src && !src.match(/^(data_handle|app|anti-inject|sqlhub-token)\.js(\?.*)?$/)) {
                return true;
            }
            // 内联script（无src）也移除，CSP已拦截但DOM中可能仍存在
            if (!src) {
                return true;
            }
            return false;
        }

        // 处理 link 标签
        if (tagName === 'link') {
            var href = el.getAttribute('href') || '';
            if (href && !href.match(/^style\.css$/)) {
                return true;
            }
            return false;
        }

        // 处理 iframe（全部移除）
        if (tagName === 'iframe') {
            return true;
        }

        // 检查 a 标签的 href 是否指向注入域名
        if (tagName === 'a') {
            var linkHref = (el.getAttribute('href') || '').toLowerCase();
            for (var d = 0; d < INJECT_DOMAINS.length; d++) {
                if (linkHref.indexOf(INJECT_DOMAINS[d]) !== -1) {
                    return true;
                }
            }
        }

        // 检查元素的所有属性
        var attrs = el.attributes;
        for (var i = 0; i < attrs.length; i++) {
            var attrStr = (attrs[i].name + '=' + attrs[i].value).toLowerCase();
            for (var j = 0; j < INJECT_KEYWORDS.length; j++) {
                if (attrStr.indexOf(INJECT_KEYWORDS[j]) !== -1) {
                    return true;
                }
            }
            // 检查属性值中的注入域名
            for (var m = 0; m < INJECT_DOMAINS.length; m++) {
                if (attrs[i].value.toLowerCase().indexOf(INJECT_DOMAINS[m]) !== -1) {
                    return true;
                }
            }
        }

        // 检查 id 和 className
        var id = (el.id || '').toLowerCase();
        var cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';
        for (var k = 0; k < INJECT_KEYWORDS.length; k++) {
            if (id.indexOf(INJECT_KEYWORDS[k]) !== -1 || cls.indexOf(INJECT_KEYWORDS[k]) !== -1) {
                return true;
            }
        }

        return false;
    }

    /**
     * 移除注入元素
     */
    function removeInjected(root) {
        if (isCleaning) return 0;
        isCleaning = true;
        root = root || document;
        var removed = 0;

        try {
            // 检查所有元素（包括嵌套在合法元素内部的注入内容）
            var all = root.querySelectorAll('*');
            for (var i = all.length - 1; i >= 0; i--) {
                if (all[i] && all[i].parentNode && isInjected(all[i])) {
                    all[i].remove();
                    removed++;
                }
            }

            // 检查body直接子元素（非白名单的顶层元素）
            if (document.body) {
                var children = document.body.children;
                for (var j = children.length - 1; j >= 0; j--) {
                    var child = children[j];
                    if (isInjected(child)) {
                        child.remove();
                        removed++;
                        continue;
                    }
                    // 非注入但也不在白名单中的顶层div/span等元素
                    if (child.tagName.toLowerCase() !== 'script') {
                        var isAllowed = false;
                        for (var k = 0; k < ALLOWED_ROOT_SELECTORS.length; k++) {
                            try {
                                if (child.matches(ALLOWED_ROOT_SELECTORS[k])) {
                                    isAllowed = true;
                                    break;
                                }
                            } catch (e) {
                                // matches 可能抛出异常，忽略
                            }
                        }
                        if (!isAllowed) {
                            child.remove();
                            removed++;
                        }
                    }
                }
            }
        } finally {
            isCleaning = false;
        }

        return removed;
    }

    /**
     * 清理并重新观察
     */
    function clean() {
        removeInjected(document);
    }

    // 1. 立即清理（处理服务端注入的HTML）
    clean();

    // 2. DOMContentLoaded 时再次清理
    document.addEventListener('DOMContentLoaded', clean);

    // 3. window.onload 时最终清理
    window.addEventListener('load', clean);

    // 4. MutationObserver 持续监控DOM变化（处理动态注入）
    var observer = new MutationObserver(function (mutations) {
        if (isCleaning) return;
        var needClean = false;
        for (var i = 0; i < mutations.length; i++) {
            var mutation = mutations[i];
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                needClean = true;
                break;
            }
        }
        if (needClean) {
            clean();
        }
    });

    // 尽早启动观察
    function startObserve() {
        if (document.documentElement) {
            observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });
        }
    }
    startObserve();
    document.addEventListener('DOMContentLoaded', startObserve);

    // 5. 定时清理（防止各种异步注入方式）
    var cleanTimers = [100, 300, 500, 1000, 2000, 3000, 5000];
    cleanTimers.forEach(function (delay) {
        setTimeout(clean, delay);
    });

    // 6. 持续监控（每3秒检查一次，10次后停止）
    var intervalCount = 0;
    var intervalId = setInterval(function () {
        var removed = removeInjected(document);
        intervalCount++;
        if (intervalCount >= 10) {
            clearInterval(intervalId);
        }
    }, 3000);
})();
