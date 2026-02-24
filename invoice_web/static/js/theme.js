/**
 * Theme Manager - 主题管理器
 * 支持亮色/暗色模式切换,自动保存用户偏好
 */

class ThemeManager {
    constructor() {
        this.THEME_KEY = 'app_theme';
        this.THEMES = {
            LIGHT: 'light',
            DARK: 'dark',
            AUTO: 'auto'
        };
        
        this.currentTheme = this.loadTheme();
        this.init();
    }

    /**
     * 初始化主题管理器
     */
    init() {
        // 应用主题
        this.applyTheme(this.currentTheme);
        
        // 监听系统主题变化
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                if (this.currentTheme === this.THEMES.AUTO) {
                    this.applyTheme(this.THEMES.AUTO);
                }
            });
        }
        
        // 创建主题切换按钮
        this.createThemeToggle();
    }

    /**
     * 从本地存储加载主题
     */
    loadTheme() {
        const saved = localStorage.getItem(this.THEME_KEY);
        return saved || this.THEMES.AUTO;
    }

    /**
     * 保存主题到本地存储
     */
    saveTheme(theme) {
        localStorage.setItem(this.THEME_KEY, theme);
    }

    /**
     * 获取实际应用的主题
     */
    getEffectiveTheme(theme) {
        if (theme === this.THEMES.AUTO) {
            // 检测系统偏好
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                return this.THEMES.DARK;
            }
            return this.THEMES.LIGHT;
        }
        return theme;
    }

    /**
     * 应用主题
     */
    applyTheme(theme) {
        const effectiveTheme = this.getEffectiveTheme(theme);
        
        // 移除旧主题类
        document.documentElement.classList.remove('theme-light', 'theme-dark');
        
        // 添加新主题类
        document.documentElement.classList.add(`theme-${effectiveTheme}`);
        
        // 更新meta标签
        this.updateMetaThemeColor(effectiveTheme);
        
        // 保存主题
        this.currentTheme = theme;
        this.saveTheme(theme);
        
        // 触发主题变化事件
        window.dispatchEvent(new CustomEvent('theme:changed', { 
            detail: { theme: effectiveTheme } 
        }));
    }

    /**
     * 更新meta主题颜色
     */
    updateMetaThemeColor(theme) {
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.content = theme === this.THEMES.DARK ? '#1f2937' : '#2563eb';
        }
    }

    /**
     * 切换主题
     */
    toggleTheme() {
        const themes = [this.THEMES.LIGHT, this.THEMES.DARK, this.THEMES.AUTO];
        const currentIndex = themes.indexOf(this.currentTheme);
        const nextTheme = themes[(currentIndex + 1) % themes.length];
        
        this.applyTheme(nextTheme);
    }

    /**
     * 设置主题
     */
    setTheme(theme) {
        if (Object.values(this.THEMES).includes(theme)) {
            this.applyTheme(theme);
        }
    }

    /**
     * 创建主题切换按钮
     */
    createThemeToggle() {
        // 查找导航栏
        const navbar = document.querySelector('.navbar-nav');
        if (!navbar) return;

        // 创建主题切换按钮
        const themeToggle = document.createElement('li');
        themeToggle.className = 'nav-item';
        themeToggle.innerHTML = `
            <button class="btn btn-link nav-link" id="themeToggle" title="切换主题">
                <i class="bi bi-sun-fill" id="themeIcon"></i>
            </button>
        `;

        // 插入到导航栏
        navbar.insertBefore(themeToggle, navbar.firstChild);

        // 绑定点击事件
        const button = themeToggle.querySelector('#themeToggle');
        button.addEventListener('click', () => this.toggleTheme());

        // 更新图标
        this.updateThemeIcon();

        // 监听主题变化以更新图标
        window.addEventListener('theme:changed', () => this.updateThemeIcon());
    }

    /**
     * 更新主题图标
     */
    updateThemeIcon() {
        const icon = document.querySelector('#themeIcon');
        if (!icon) return;

        const effectiveTheme = this.getEffectiveTheme(this.currentTheme);
        
        // 移除所有图标类
        icon.className = '';
        
        // 根据主题设置图标
        if (this.currentTheme === this.THEMES.AUTO) {
            icon.className = 'bi bi-circle-half';
        } else if (effectiveTheme === this.THEMES.DARK) {
            icon.className = 'bi bi-moon-stars-fill';
        } else {
            icon.className = 'bi bi-sun-fill';
        }
    }

    /**
     * 获取当前主题
     */
    getCurrentTheme() {
        return this.currentTheme;
    }

    /**
     * 获取有效主题
     */
    getActiveTheme() {
        return this.getEffectiveTheme(this.currentTheme);
    }
}

// 创建全局实例
const themeManager = new ThemeManager();

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ThemeManager;
}
