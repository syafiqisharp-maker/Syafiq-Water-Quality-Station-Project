/**
 * iSHARP DBMS 2.0 — Role-Based Access Control (RBAC) Engine
 * Defines user roles, permission scopes, and UI-level capability gating.
 */

export const ROLES = {
    PLANNER: "PLANNER",           // Full 100% edit power: Master, Rollover, Stocking, Parameters
    SUPERVISOR: "SUPERVISOR",     // Operations & Field: Inventory (PWA, Feed trays), Equipment, Field notes
    LAB_TECH: "LAB_TECH",         // Laboratory Only: Water quality & Pathogen PCR logs
    VIEWER: "VIEWER"              // Read-only: Analytics, Reports, Viewing active ponds
};

export const PERMISSIONS = {
    // Planner Actions
    EDIT_MASTER_CYCLE: "edit:master_cycle",
    EXECUTE_ROLLOVER: "execute:rollover",
    EDIT_STOCKING_PARAMS: "edit:stocking_params",
    DELETE_RECORDS: "delete:records",

    // Supervisor / Field Actions
    EDIT_INVENTORY: "edit:inventory",
    EDIT_AERATORS: "edit:aerators",
    WRITE_POND_NOTES: "write:pond_notes",
    EDIT_FEED_RECORDS: "edit:feed_records",

    // Lab Tech Actions
    EDIT_LAB_RECORDS: "edit:lab_records",
    EDIT_WQS_CALIBRATION: "edit:wqs_calibration",

    // General
    IMPORT_EXCEL: "import:excel",
    EXPORT_CSV: "export:csv"
};

// Permission matrix
const ROLE_PERMISSIONS = {
    [ROLES.PLANNER]: Object.values(PERMISSIONS), // All permissions granted

    [ROLES.SUPERVISOR]: [
        PERMISSIONS.EDIT_INVENTORY,
        PERMISSIONS.EDIT_AERATORS,
        PERMISSIONS.WRITE_POND_NOTES,
        PERMISSIONS.EDIT_FEED_RECORDS,
        PERMISSIONS.IMPORT_EXCEL,
        PERMISSIONS.EXPORT_CSV
    ],

    [ROLES.LAB_TECH]: [
        PERMISSIONS.EDIT_LAB_RECORDS,
        PERMISSIONS.EDIT_WQS_CALIBRATION,
        PERMISSIONS.IMPORT_EXCEL,
        PERMISSIONS.EXPORT_CSV
    ],

    [ROLES.VIEWER]: [
        PERMISSIONS.EXPORT_CSV
    ]
};

/**
 * Check if a given role has a specific permission
 * @param {string} role 
 * @param {string} permission 
 * @returns {boolean}
 */
export function hasPermission(role, permission) {
    const roleUpper = (role || ROLES.VIEWER).toUpperCase();
    const allowedList = ROLE_PERMISSIONS[roleUpper] || [];
    return allowedList.includes(permission);
}

/**
 * Get human-readable description for role badge
 * @param {string} role 
 * @returns {{ label: string, color: string, badgeIcon: string }}
 */
export function getRoleMeta(role) {
    switch ((role || "").toUpperCase()) {
        case ROLES.PLANNER:
            return { label: "Farm Planner (Full Access)", color: "var(--status-production)", badgeIcon: "👑" };
        case ROLES.SUPERVISOR:
            return { label: "Pond Supervisor (Field & Inventory)", color: "var(--aero-sky-600)", badgeIcon: "📋" };
        case ROLES.LAB_TECH:
            return { label: "Lab Technician (WQS & Tests)", color: "var(--aero-aqua-600)", badgeIcon: "🔬" };
        default:
            return { label: "Executive Viewer (Read Only)", color: "var(--status-close)", badgeIcon: "👁️" };
    }
}
