/**
 * Enhanced API Client with Interceptors
 * 增强的API客户端 - 统一错误处理、请求拦截、响应处理
 */

import { showError, showSuccess, loadingManager } from './utils.js';

/**
 * API客户端配置
 */
const config = {
    baseUrl: '/api',
    timeout: 30000,
    retryAttempts: 2,
    retryDelay: 1000,
    showLoading: true,
    showErrorToast: true
};

/**
 * 请求拦截器列表
 */
const requestInterceptors = [];

/**
 * 响应拦截器列表
 */
const responseInterceptors = [];

/**
 * 添加请求拦截器
 * @param {Function} interceptor - 拦截器函数
 */
export function addRequestInterceptor(interceptor) {
    requestInterceptors.push(interceptor);
}

/**
 * 添加响应拦截器
 * @param {Function} interceptor - 拦截器函数
 */
export function addResponseInterceptor(interceptor) {
    responseInterceptors.push(interceptor);
}

/**
 * 执行请求拦截器
 * @param {Object} options - 请求选项
 * @returns {Object} 处理后的选项
 */
async function executeRequestInterceptors(options) {
    let processedOptions = { ...options };
    
    for (const interceptor of requestInterceptors) {
        processedOptions = await interceptor(processedOptions);
    }
    
    return processedOptions;
}

/**
 * 执行响应拦截器
 * @param {Response} response - 响应对象
 * @returns {Response} 处理后的响应
 */
async function executeResponseInterceptors(response) {
    let processedResponse = response;
    
    for (const interceptor of responseInterceptors) {
        processedResponse = await interceptor(processedResponse);
    }
    
    return processedResponse;
}

/**
 * 创建超时Promise
 * @param {number} ms - 超时时间
 * @returns {Promise}
 */
function createTimeoutPromise(ms) {
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error('请求超时')), ms);
    });
}

/**
 * 延迟函数
 * @param {number} ms - 延迟时间
 * @returns {Promise}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 增强的fetch请求
 * @param {string} url - 请求URL
 * @param {Object} options - 请求选项
 * @returns {Promise}
 */
async function enhancedFetch(url, options = {}) {
    const {
        showLoading: shouldShowLoading = config.showLoading,
        loadingMessage = '加载中...',
        retryAttempts = config.retryAttempts,
        retryDelay = config.retryDelay,
        timeout = config.timeout,
        ...fetchOptions
    } = options;

    // 显示加载状态
    if (shouldShowLoading) {
        loadingManager.show(loadingMessage);
    }

    let lastError;
    
    try {
        // 执行请求拦截器
        const processedOptions = await executeRequestInterceptors(fetchOptions);
        
        // 重试逻辑
        for (let attempt = 0; attempt <= retryAttempts; attempt++) {
            try {
                // 带超时的fetch请求
                const fetchPromise = fetch(url, processedOptions);
                const timeoutPromise = createTimeoutPromise(timeout);
                
                const response = await Promise.race([fetchPromise, timeoutPromise]);
                
                // 执行响应拦截器
                const processedResponse = await executeResponseInterceptors(response);
                
                return processedResponse;
            } catch (error) {
                lastError = error;
                console.error(`请求失败 (尝试 ${attempt + 1}/${retryAttempts + 1}):`, error);
                
                // 如果不是最后一次尝试,等待后重试
                if (attempt < retryAttempts) {
                    await delay(retryDelay * (attempt + 1)); // 指数退避
                }
            }
        }
        
        throw lastError;
    } finally {
        // 隐藏加载状态
        if (shouldShowLoading) {
            loadingManager.hide();
        }
    }
}

/**
 * 处理响应
 * @param {Response} response - 响应对象
 * @param {Object} options - 选项
 * @returns {Promise}
 */
async function handleResponse(response, options = {}) {
    const { showErrorToast = config.showErrorToast } = options;
    
    // 检查响应状态
    if (!response.ok) {
        let errorMessage = `请求失败: ${response.status} ${response.statusText}`;
        
        try {
            const data = await response.json();
            errorMessage = data.message || data.error || errorMessage;
            
            // 特殊处理需要登录的情况
            if (data.need_login) {
                // 触发登录事件
                window.dispatchEvent(new CustomEvent('auth:required'));
                throw new Error('需要登录');
            }
        } catch (e) {
            if (e.message === '需要登录') throw e;
            // JSON解析失败,使用默认错误消息
        }
        
        if (showErrorToast) {
            showError(errorMessage);
        }
        
        throw new Error(errorMessage);
    }
    
    return response;
}

/**
 * API客户端类
 */
export class ApiClient {
    constructor(baseUrl = config.baseUrl) {
        this.baseUrl = baseUrl;
    }

    /**
     * GET请求
     * @param {string} endpoint - 端点
     * @param {Object} params - 查询参数
     * @param {Object} options - 选项
     * @returns {Promise}
     */
    async get(endpoint, params = {}, options = {}) {
        const queryString = new URLSearchParams(
            Object.entries(params).filter(([_, v]) => v !== null && v !== undefined && v !== '')
        ).toString();
        
        const url = `${this.baseUrl}${endpoint}${queryString ? `?${queryString}` : ''}`;
        
        const response = await enhancedFetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            ...options
        });
        
        await handleResponse(response, options);
        return response.json();
    }

    /**
     * POST请求
     * @param {string} endpoint - 端点
     * @param {Object|FormData} data - 请求数据
     * @param {Object} options - 选项
     * @returns {Promise}
     */
    async post(endpoint, data = {}, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        const isFormData = data instanceof FormData;
        
        const response = await enhancedFetch(url, {
            method: 'POST',
            headers: isFormData ? {} : {
                'Content-Type': 'application/json',
            },
            body: isFormData ? data : JSON.stringify(data),
            ...options
        });
        
        await handleResponse(response, options);
        return response.json();
    }

    /**
     * PUT请求
     * @param {string} endpoint - 端点
     * @param {Object} data - 请求数据
     * @param {Object} options - 选项
     * @returns {Promise}
     */
    async put(endpoint, data = {}, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        const response = await enhancedFetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
            ...options
        });
        
        await handleResponse(response, options);
        return response.json();
    }

    /**
     * DELETE请求
     * @param {string} endpoint - 端点
     * @param {Object} options - 选项
     * @returns {Promise}
     */
    async delete(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        const response = await enhancedFetch(url, {
            method: 'DELETE',
            ...options
        });
        
        await handleResponse(response, options);
        return response.json();
    }

    /**
     * 下载文件
     * @param {string} endpoint - 端点
     * @param {Object} params - 查询参数
     * @param {string} filename - 文件名
     * @param {Object} options - 选项
     * @returns {Promise}
     */
    async download(endpoint, params = {}, filename = 'download', options = {}) {
        const queryString = new URLSearchParams(
            Object.entries(params).filter(([_, v]) => v !== null && v !== undefined && v !== '')
        ).toString();
        
        const url = `${this.baseUrl}${endpoint}${queryString ? `?${queryString}` : ''}`;
        
        const response = await enhancedFetch(url, {
            method: 'GET',
            ...options
        });
        
        await handleResponse(response, options);
        
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
        
        return blob;
    }

    /**
     * 上传文件
     * @param {string} endpoint - 端点
     * @param {File|File[]} files - 文件
     * @param {Object} additionalData - 额外数据
     * @param {Object} options - 选项
     * @returns {Promise}
     */
    async upload(endpoint, files, additionalData = {}, options = {}) {
        const formData = new FormData();
        
        // 添加文件
        if (Array.isArray(files)) {
            files.forEach((file, index) => {
                formData.append(`file${index}`, file);
            });
        } else {
            formData.append('file', files);
        }
        
        // 添加额外数据
        Object.entries(additionalData).forEach(([key, value]) => {
            formData.append(key, value);
        });
        
        return this.post(endpoint, formData, options);
    }
}

/**
 * 默认API客户端实例
 */
export const apiClient = new ApiClient();

/**
 * 添加默认拦截器
 */

// 请求拦截器: 添加认证token
addRequestInterceptor(async (options) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };
    }
    return options;
});

// 响应拦截器: 处理401未授权
addResponseInterceptor(async (response) => {
    if (response.status === 401) {
        // 清除token
        localStorage.removeItem('auth_token');
        // 触发登录事件
        window.dispatchEvent(new CustomEvent('auth:required'));
    }
    return response;
});

// 响应拦截器: 记录请求日志
addResponseInterceptor(async (response) => {
    if (process.env.NODE_ENV === 'development') {
        console.log(`[API] ${response.url} - ${response.status}`);
    }
    return response;
});

/**
 * 导出配置函数
 */
export function configureApi(newConfig) {
    Object.assign(config, newConfig);
}

export default apiClient;
