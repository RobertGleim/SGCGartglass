-- =============================================================================
-- SGCG Designer - MySQL 8.0+ Database Schema
-- Run against database: e.g. u159464737_sgcgdb
-- Usage: mysql -u USER -p -h HOST DATABASE < database/schema.sql
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- Table: templates
-- SVG templates available in the designer. Each template has one or more
-- regions (glass pieces) defined in template_regions.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS `templates`;
CREATE TABLE `templates` (
  `id` int unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `name` varchar(255) NOT NULL COMMENT 'Display name of the template (e.g. Sunflower, Geometric Panel)',
  `description` text COMMENT 'Optional description for gallery/catalog',
  `category` varchar(100) DEFAULT NULL COMMENT 'Category for filtering (e.g. Floral, Geometric, Custom)',
  `svg_content` longtext NOT NULL COMMENT 'Full SVG markup; each region is a <path> with unique id',
  `thumbnail_url` varchar(500) DEFAULT NULL COMMENT 'Optional thumbnail image URL for gallery',
  `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1 = shown in gallery, 0 = hidden',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Row creation time',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last update time',
  PRIMARY KEY (`id`),
  KEY `idx_templates_category` (`category`),
  KEY `idx_templates_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='SVG templates for the stained glass designer';

-- -----------------------------------------------------------------------------
-- Table: template_regions
-- One row per glass piece (path) in a template. region_id matches the SVG
-- <path id="..."> so the app can map design_data back to regions.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS `template_regions`;
CREATE TABLE `template_regions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `template_id` int unsigned NOT NULL COMMENT 'Parent template',
  `region_id` varchar(100) NOT NULL COMMENT 'SVG path id; must match id in template svg_content',
  `display_order` int NOT NULL DEFAULT 0 COMMENT 'Order for UI (e.g. 0, 1, 2)',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Row creation time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_template_region` (`template_id`, `region_id`),
  KEY `idx_template_regions_template_id` (`template_id`),
  CONSTRAINT `fk_template_regions_template` FOREIGN KEY (`template_id`) REFERENCES `templates` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Glass regions (paths) per template; region_id = path id in SVG';

-- -----------------------------------------------------------------------------
-- Table: glass_types
-- Texture library for glass. Admin can activate/deactivate; only active types
-- appear in the designer dropdown.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS `glass_types`;
CREATE TABLE `glass_types` (
  `id` int unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `name` varchar(100) NOT NULL COMMENT 'Display name (e.g. Clear, Frosted, Cathedral)',
  `description` text COMMENT 'Optional description for UI',
  `texture_url` varchar(500) DEFAULT NULL COMMENT 'Optional texture image URL for preview',
  `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1 = shown in designer, 0 = hidden by admin',
  `display_order` int NOT NULL DEFAULT 0 COMMENT 'Order in designer dropdown',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Row creation time',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last update time',
  PRIMARY KEY (`id`),
  KEY `idx_glass_types_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Glass texture types; active ones shown in designer';

-- -----------------------------------------------------------------------------
-- Table: user_projects
-- Saved designs. design_data is JSON: { "regionId": { "color": "#hex", "glassTypeId": n }, ... }.
-- user_id references the app auth system (no FK if users live in another DB).
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS `user_projects`;
CREATE TABLE `user_projects` (
  `id` int unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `user_id` int unsigned NOT NULL COMMENT 'Owner; references application user id',
  `template_id` int unsigned DEFAULT NULL COMMENT 'Base template; NULL if custom or template deleted',
  `name` varchar(255) DEFAULT NULL COMMENT 'User-defined project name',
  `design_data` json NOT NULL COMMENT 'Map of region_id -> { color, glassTypeId }; defines fill per region',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Row creation time',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last update time',
  PRIMARY KEY (`id`),
  KEY `idx_user_projects_user_id` (`user_id`),
  KEY `idx_user_projects_template_id` (`template_id`),
  CONSTRAINT `fk_user_projects_template` FOREIGN KEY (`template_id`) REFERENCES `templates` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Saved designer projects; design_data = regions with colors and glass types';

-- -----------------------------------------------------------------------------
-- Table: work_orders
-- Customer submissions. work_order_number format: WO-YYYY-#### (e.g. WO-2025-0001).
-- Status workflow: Pending Review -> Under Review -> Quote Sent -> Approved -> In Production -> Completed.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS `work_orders`;
CREATE TABLE `work_orders` (
  `id` int unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `work_order_number` varchar(20) NOT NULL COMMENT 'Unique; format WO-YYYY-####',
  `project_id` int unsigned DEFAULT NULL COMMENT 'Source project; NULL if submitted without saving project',
  `user_id` int unsigned NOT NULL COMMENT 'Submitting user id',
  `status` enum('Pending Review','Under Review','Quote Sent','Approved','In Production','Completed','Cancelled') NOT NULL DEFAULT 'Pending Review' COMMENT 'Workflow status',
  `customer_notes` text COMMENT 'Notes from customer at submission',
  `quote_amount` decimal(10,2) DEFAULT NULL COMMENT 'Quote in currency (e.g. USD)',
  `admin_notes` text COMMENT 'Internal notes; not shown to customer',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Submission time',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last status/quote update',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_work_orders_number` (`work_order_number`),
  KEY `idx_work_orders_status` (`status`),
  KEY `idx_work_orders_user_id` (`user_id`),
  KEY `idx_work_orders_project_id` (`project_id`),
  KEY `idx_work_orders_created_at` (`created_at`),
  CONSTRAINT `fk_work_orders_project` FOREIGN KEY (`project_id`) REFERENCES `user_projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Work orders; only output path (no design downloads)';

-- -----------------------------------------------------------------------------
-- Table: work_order_status_history
-- Audit trail for status changes. One row per change (admin review, quote sent, etc.).
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS `work_order_status_history`;
CREATE TABLE `work_order_status_history` (
  `id` int unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `work_order_id` int unsigned NOT NULL COMMENT 'Work order that was updated',
  `from_status` varchar(50) DEFAULT NULL COMMENT 'Previous status; NULL when first recorded',
  `to_status` varchar(50) NOT NULL COMMENT 'New status (matches work_orders.status enum values)',
  `changed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the change occurred',
  `changed_by` int unsigned DEFAULT NULL COMMENT 'Admin/user id who made the change; NULL if system',
  PRIMARY KEY (`id`),
  KEY `idx_wo_history_work_order_id` (`work_order_id`),
  KEY `idx_wo_history_changed_at` (`changed_at`),
  CONSTRAINT `fk_wo_history_work_order` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Audit log of work order status changes';

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- Seed data: glass_types (10 types for designer dropdown)
-- =============================================================================
INSERT INTO `glass_types` (`name`, `description`, `display_order`) VALUES
('Clear', 'Transparent clear glass', 1),
('Frosted', 'Translucent frosted finish', 2),
('Ripple', 'Rippled texture', 3),
('Cathedral', 'Classic cathedral texture', 4),
('Seedy', 'Seedy / bubble texture', 5),
('Hammered', 'Hammered texture', 6),
('Opalescent', 'Opalescent finish', 7),
('Iridescent', 'Iridescent finish', 8),
('Beveled', 'Beveled edge style', 9),
('Crackle', 'Crackle texture', 10);
