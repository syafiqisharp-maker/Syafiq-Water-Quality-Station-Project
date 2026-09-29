/**
 * iSHARP DBMS 2.0 — Toast Notification Service
 * Frutiger Aero floating glass toast stack.
 */

class ToastService {
    constructor() {
        this.container = null;
        this.init();
    }

    init() {
        if (!document.getElementById("toast-container")) {
            this.container = document.createElement("div");
            this.container.id = "toast-container";
            document.body.appendChild(this.container);
        } else {
            this.container = document.getElementById("toast-container");
        }
    }

    /**
     * Show a floating notification
     * @param {string} message 
     * @param {"info"|"success"|"error"} [type="info"] 
     * @param {number} [duration=3500] 
     */
    show(message, type = "info", duration = 3500) {
        if (!this.container) this.init();

        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;

        const icons = {
            success: "✅",
            error: "❌",
            info: "ℹ️"
        };

        toast.innerHTML = `
            <span>${icons[type] || "ℹ️"}</span>
            <span>${message}</span>
        `;

        this.container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateY(10px)";
            toast.style.transition = "all 0.3s ease";
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    success(msg) { this.show(msg, "success"); }
    error(msg) { this.show(msg, "error"); }
    info(msg) { this.show(msg, "info"); }
}

export const Toast = new ToastService();
