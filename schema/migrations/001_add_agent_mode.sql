-- ============================================================================
-- Migration: Add Agent Mode Support
-- ============================================================================
-- This migration adds ReAct agent capabilities to the Ollama Context Chat
-- application, including automatic complexity detection and reasoning steps.
--
-- Usage:
--   mysql -u root -p ollama-chat < schema/migrations/001_add_agent_mode.sql
-- ============================================================================

-- ============================================================================
-- 1. EXTEND CUSTOM_MODELS TABLE
-- ============================================================================
-- Add agent configuration options to custom models

ALTER TABLE `custom_models`
ADD COLUMN `agentMode` ENUM('disabled', 'auto', 'forced') DEFAULT 'auto' COMMENT 'Agent mode: disabled, auto-detect, or always use agent',
ADD COLUMN `agentMaxIterations` INT DEFAULT 5 COMMENT 'Maximum ReAct loop iterations',
ADD COLUMN `agentShowReasoning` BOOLEAN DEFAULT TRUE COMMENT 'Display reasoning steps to user',
ADD COLUMN `agentTemperature` DECIMAL(3,2) DEFAULT 0.7 COMMENT 'Temperature for agent reasoning (0.0-1.0)',
ADD COLUMN `agentComplexityThreshold` ENUM('low', 'medium', 'high') DEFAULT 'medium' COMMENT 'Minimum complexity to trigger agent mode';

-- ============================================================================
-- 2. EXTEND MESSAGES TABLE
-- ============================================================================
-- Add agent metadata to messages

ALTER TABLE `messages`
ADD COLUMN `messageType` ENUM('standard', 'agent') DEFAULT 'standard' COMMENT 'Message type: standard or agent-generated',
ADD COLUMN `agentSteps` JSON DEFAULT NULL COMMENT 'Array of ReAct steps: thought, action, observation',
ADD COLUMN `agentToolsUsed` JSON DEFAULT NULL COMMENT 'List of tools used by agent',
ADD COLUMN `agentIterations` INT DEFAULT NULL COMMENT 'Number of ReAct iterations performed',
ADD COLUMN `agentComplexity` ENUM('low', 'medium', 'high') DEFAULT NULL COMMENT 'Detected query complexity',
ADD COLUMN `agentMetadata` JSON DEFAULT NULL COMMENT 'Additional agent metadata';

-- ============================================================================
-- 3. CREATE AGENT_STEPS TABLE
-- ============================================================================
-- Detailed audit trail of agent reasoning steps

DROP TABLE IF EXISTS `agent_steps`;
CREATE TABLE `agent_steps` (
  `stepId` INT(11) NOT NULL AUTO_INCREMENT,
  `stepUUID` VARCHAR(36) NOT NULL,
  `messageId` INT(11) NOT NULL,
  `stepNumber` INT NOT NULL,
  `stepType` ENUM('thought', 'action', 'observation', 'final_answer') NOT NULL,
  `stepContent` TEXT NOT NULL,
  `toolName` VARCHAR(100) DEFAULT NULL COMMENT 'Tool used in action step',
  `toolInput` JSON DEFAULT NULL COMMENT 'Tool input parameters',
  `toolOutput` TEXT DEFAULT NULL COMMENT 'Tool execution result',
  `stepTimestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `stepDurationMs` INT DEFAULT NULL COMMENT 'Step execution time in milliseconds',
  PRIMARY KEY (`stepId`),
  UNIQUE KEY `stepUUID` (`stepUUID`),
  KEY `idx_message` (`messageId`),
  KEY `idx_step_number` (`stepNumber`),
  KEY `idx_step_type` (`stepType`),
  KEY `idx_timestamp` (`stepTimestamp`),
  CONSTRAINT `fk_agent_step_message` FOREIGN KEY (`messageId`) REFERENCES `messages` (`messageId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 4. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for filtering agent messages
CREATE INDEX `idx_message_type` ON `messages` (`messageType`);

-- Index for complexity-based queries
CREATE INDEX `idx_agent_complexity` ON `messages` (`agentComplexity`);

-- ============================================================================
-- 5. UPDATE DEFAULT MODEL WITH AGENT SETTINGS
-- ============================================================================

UPDATE `custom_models`
SET
  `agentMode` = 'auto',
  `agentMaxIterations` = 5,
  `agentShowReasoning` = TRUE,
  `agentTemperature` = 0.7,
  `agentComplexityThreshold` = 'medium'
WHERE `isDefault` = TRUE;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Agent mode support has been added to the database schema.
-- New features:
--   - Agent configuration in custom_models table
--   - Agent metadata in messages table
--   - Detailed agent_steps audit trail
--   - Automatic complexity detection support
-- ============================================================================
