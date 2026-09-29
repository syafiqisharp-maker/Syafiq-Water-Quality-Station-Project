/**
 * iSHARP DBMS 2.0 — View Router
 * Coordinates top-level view switching between Portal Landing, Executive Dashboard, and Operations DBMS.
 */

import { appState } from "../state/appState.js";

export class ViewRouter {
    constructor() {
        this.views = {
            portal: document.getElementById("view-portal"),
            executive: document.getElementById("view-executive"),
            dbms: document.getElementById("view-dbms")
        };

        this.init();
    }

    init() {
        // Handle initial hash or default to portal
        window.addEventListener("hashchange", () => this.handleHashChange());
        
        // Listen to appState viewChanged event
        appState.subscribe("viewChanged", (viewName) => {
            this.renderView(viewName);
        });

        // Delegate clicks on elements with data-nav-view
        document.addEventListener("click", (e) => {
            const navBtn = e.target.closest("[data-nav-view]");
            if (navBtn) {
                const targetView = navBtn.getAttribute("data-nav-view");
                if (targetView) {
                    this.navigate(targetView);
                }
            }
        });

        // Trigger initial view based on current hash
        this.handleHashChange();
    }

    handleHashChange() {
        const hash = window.location.hash.toLowerCase();
        let targetView = "portal";

        if (hash === "#/executive" || hash === "#executive") {
            targetView = "executive";
        } else if (hash === "#/dbms" || hash === "#dbms") {
            targetView = "dbms";
        } else {
            targetView = "portal";
        }

        appState.setView(targetView);
        this.renderView(targetView);
    }

    navigate(viewName) {
        if (!["portal", "executive", "dbms"].includes(viewName)) {
            viewName = "portal";
        }
        window.location.hash = `#/${viewName}`;
    }

    renderView(viewName) {
        Object.entries(this.views).forEach(([name, el]) => {
            if (!el) return;
            if (name === viewName) {
                el.classList.add("active-view");
                el.style.display = "flex";
            } else {
                el.classList.remove("active-view");
                el.style.display = "none";
            }
        });

        // Scroll to top when view changes
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
}
