/**
 * Utility Functions for Invoice Management System
 * 工具函数库 - 提供通用功能和性能优化
 */

// ============================================
// Performance Utilities - 性能优化工具
// ============================================

/**
 * 防抖函数 - 延迟执行,多次调用只执行最后一次
 * @param {Function} func - 要防抖的函数
 * @param {number} wait - 等待时间(毫秒)
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 节流函数 - 限制函数执行频率
 * @param {Function} func - 要节流的函数
 * @param {number} limit - 时间限制(毫秒)
 * @returns {Function} 节流后的函数
 */
export function throttle(func, limit = 300) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * 延迟执行 - Promise版本的setTimeout
 * @param {number} ms - 延迟时间(毫秒)
 * @returns {Promise}
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// Error Handling - 错误处理
// ============================================

/**
 * 安全执行异步函数,统一错误处理
 * @param {Function} asyncFn - 异步函数
 * @param {Object} options - 选项
 * @returns {Promise<[Error|null, any]>} [错误, 结果]
 */
export async function safeAsync(asyncFn, options = {}) {
    const {
        onError = null,
        defaultValue = null,
        retries = 0,
        retryDelay = 1000
    } = options;

    let lastError;
    for (let i = 0; i <= retries; i++) {
        try {
            const result = await asyncFn();
            return [null, result];
        } catch (error) {
            lastError = error;
            console.error(`Attempt ${i + 1} failed:`, error);
            
            if (i < retries) {
                await delay(retryDelay);
            }
        }
    }

    if (onError) {
        onError(lastError);
    }
    return [lastError, defaultValue];
}

/**
 * 显示错误提示
 * @param {string} message - 错误消息
 * @param {Error} error - 错误对象
 */
export function showError(message, error = null) {
    console.error(message, error);
    
    // 使用Toast显示错误
    if (typeof showToast === 'function') {
        showToast(message, 'danger');
    } else {
        alert(message);
    }
}

/**
 * 显示成功提示
 * @param {string} message - 成功消息
 */
export function showSuccess(message) {
    if (typeof showToast === 'function') {
        showToast(message, 'success');
    } else {
        console.log(message);
    }
}

// ============================================
// Data Formatting - 数据格式化
// ============================================

/**
 * 格式化金额
 * @param {number|string} amount - 金额
 * @param {string} currency - 货币符号
 * @returns {string} 格式化后的金额
 */
export function formatCurrency(amount, currency = '¥') {
    const num = parseFloat(amount);
    if (isNaN(num)) return `${currency}0.00`;
    return `${currency}${num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/**
 * 格式化日期
 * @param {string|Date} date - 日期
 * @param {string} format - 格式
 * @returns {string} 格式化后的日期
 */
export function formatDate(date, format = 'YYYY-MM-DD') {
    if (!date) return '';
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    
    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
}

/**
 * 截断文本
 * @param {string} text - 文本
 * @param {number} maxLength - 最大长度
 * @param {string} suffix - 后缀
 * @returns {string} 截断后的文本
 */
export function truncateText(text, maxLength = 50, suffix = '...') {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - suffix.length) + suffix;
}

// ============================================
// DOM Utilities - DOM操作工具
// ============================================

/**
 * 安全获取DOM元素
 * @param {string} selector - 选择器
 * @param {Element} parent - 父元素
 * @returns {Element|null}
 */
export function $(selector, parent = document) {
    return parent.querySelector(selector);
}

/**
 * 安全获取多个DOM元素
 * @param {string} selector - 选择器
 * @param {Element} parent - 父元素
 * @returns {NodeList}
 */
export function $$(selector, parent = document) {
    return parent.querySelectorAll(selector);
}

/**
 * 添加事件监听器(自动清理)
 * @param {Element} element - 元素
 * @param {string} event - 事件名
 * @param {Function} handler - 处理函数
 * @param {Object} options - 选项
 */
export function addEvent(element, event, handler, options = {}) {
    if (!element) return;
    element.addEventListener(event, handler, options);
    
    // 返回清理函数
    return () => element.removeEventListener(event, handler, options);
}

/**
 * 切换元素显示/隐藏
 * @param {Element} element - 元素
 * @param {boolean} show - 是否显示
 */
export function toggleElement(element, show) {
    if (!element) return;
    
    if (show) {
        element.classList.remove('d-none');
        element.style.display = '';
    } else {
        element.classList.add('d-none');
    }
}

/**
 * 添加CSS类(支持动画)
 * @param {Element} element - 元素
 * @param {string} className - 类名
 * @param {number} duration - 持续时间(毫秒)
 */
export async function addClassWithAnimation(element, className, duration = 0) {
    if (!element) return;
    
    element.classList.add(className);
    
    if (duration > 0) {
        await delay(duration);
        element.classList.remove(className);
    }
}

// ============================================
// Validation - 数据验证
// ============================================

/**
 * 验证邮箱格式
 * @param {string} email - 邮箱
 * @returns {boolean}
 */
export function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * 验证手机号格式
 * @param {string} phone - 手机号
 * @returns {boolean}
 */
export function isValidPhone(phone) {
    const re = /^1[3-9]\d{9}$/;
    return re.test(phone);
}

/**
 * 验证文件类型
 * @param {File} file - 文件
 * @param {string[]} allowedTypes - 允许的类型
 * @returns {boolean}
 */
export function isValidFileType(file, allowedTypes) {
    if (!file) return false;
    return allowedTypes.some(type => {
        if (type.startsWith('.')) {
            return file.name.toLowerCase().endsWith(type.toLowerCase());
        }
        return file.type === type;
    });
}

/**
 * 验证文件大小
 * @param {File} file - 文件
 * @param {number} maxSizeMB - 最大大小(MB)
 * @returns {boolean}
 */
export function isValidFileSize(file, maxSizeMB) {
    if (!file) return false;
    return file.size <= maxSizeMB * 1024 * 1024;
}

// ============================================
// Storage - 本地存储
// ============================================

/**
 * 安全的localStorage操作
 */
export const storage = {
    /**
     * 获取数据
     * @param {string} key - 键
     * @param {any} defaultValue - 默认值
     * @returns {any}
     */
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('Storage get error:', error);
            return defaultValue;
        }
    },

    /**
     * 设置数据
     * @param {string} key - 键
     * @param {any} value - 值
     * @returns {boolean}
     */
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Storage set error:', error);
            return false;
        }
    },

    /**
     * 删除数据
     * @param {string} key - 键
     */
    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.error('Storage remove error:', error);
        }
    },

    /**
     * 清空所有数据
     */
    clear() {
        try {
            localStorage.clear();
        } catch (error) {
            console.error('Storage clear error:', error);
        }
    }
};

// ============================================
// URL Utilities - URL工具
// ============================================

/**
 * 获取URL参数
 * @param {string} name - 参数名
 * @param {string} url - URL(默认当前页面)
 * @returns {string|null}
 */
export function getUrlParam(name, url = window.location.href) {
    const params = new URLSearchParams(new URL(url).search);
    return params.get(name);
}

/**
 * 构建URL查询字符串
 * @param {Object} params - 参数对象
 * @returns {string}
 */
export function buildQueryString(params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
            searchParams.append(key, value);
        }
    });
    return searchParams.toString();
}

// ============================================
// Array Utilities - 数组工具
// ============================================

/**
 * 数组去重
 * @param {Array} array - 数组
 * @param {string|Function} key - 去重键或函数
 * @returns {Array}
 */
export function uniqueArray(array, key = null) {
    if (!key) {
        return [...new Set(array)];
    }
    
    const seen = new Set();
    return array.filter(item => {
        const k = typeof key === 'function' ? key(item) : item[key];
        if (seen.has(k)) {
            return false;
        }
        seen.add(k);
        return true;
    });
}

/**
 * 数组分组
 * @param {Array} array - 数组
 * @param {string|Function} key - 分组键或函数
 * @returns {Object}
 */
export function groupBy(array, key) {
    return array.reduce((result, item) => {
        const k = typeof key === 'function' ? key(item) : item[key];
        (result[k] = result[k] || []).push(item);
        return result;
    }, {});
}

/**
 * 数组排序
 * @param {Array} array - 数组
 * @param {string|Function} key - 排序键或函数
 * @param {string} order - 排序方向('asc'|'desc')
 * @returns {Array}
 */
export function sortArray(array, key, order = 'asc') {
    const sorted = [...array].sort((a, b) => {
        const aVal = typeof key === 'function' ? key(a) : a[key];
        const bVal = typeof key === 'function' ? key(b) : b[key];
        
        if (aVal < bVal) return order === 'asc' ? -1 : 1;
        if (aVal > bVal) return order === 'asc' ? 1 : -1;
        return 0;
    });
    return sorted;
}

// ============================================
// Loading State - 加载状态管理
// ============================================

/**
 * 加载状态管理器
 */
export class LoadingManager {
    constructor() {
        this.loadingCount = 0;
        this.overlay = null;
    }

    /**
     * 显示加载状态
     * @param {string} message - 加载消息
     */
    show(message = '加载中...') {
        this.loadingCount++;
        
        if (!this.overlay) {
            this.overlay = document.createElement('div');
            this.overlay.className = 'loading-overlay';
            this.overlay.innerHTML = `
                <div class="text-center">
                    <div class="spinner-border text-primary mb-3" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <div class="loading-message text-muted">${message}</div>
                </div>
            `;
            document.body.appendChild(this.overlay);
        }
    }

    /**
     * 隐藏加载状态
     */
    hide() {
        this.loadingCount = Math.max(0, this.loadingCount - 1);
        
        if (this.loadingCount === 0 && this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }

    /**
     * 包装异步函数,自动显示/隐藏加载状态
     * @param {Function} asyncFn - 异步函数
     * @param {string} message - 加载消息
     * @returns {Promise}
     */
    async wrap(asyncFn, message = '加载中...') {
        this.show(message);
        try {
            return await asyncFn();
        } finally {
            this.hide();
        }
    }
}

// 导出单例
export const loadingManager = new LoadingManager();

// ============================================
// Export All - 导出所有工具
// ============================================

export default {
    debounce,
    throttle,
    delay,
    safeAsync,
    showError,
    showSuccess,
    formatCurrency,
    formatDate,
    truncateText,
    $,
    $$,
    addEvent,
    toggleElement,
    addClassWithAnimation,
    isValidEmail,
    isValidPhone,
    isValidFileType,
    isValidFileSize,
    storage,
    getUrlParam,
    buildQueryString,
    uniqueArray,
    groupBy,
    sortArray,
    LoadingManager,
    loadingManager
};
