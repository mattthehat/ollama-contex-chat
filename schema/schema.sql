-- ============================================================================
-- Ollama Context Chat - Complete Database Schema
-- ============================================================================
-- This file contains the complete database schema including all tables,
-- indices, and initial data for the Ollama Context Chat application.
--
-- Prerequisites:
-- - MariaDB 11.7+ (for native vector support)
--
-- Usage:
--   mysql -u root -p -e "CREATE DATABASE \`ollama-chat\`;"
--   mysql -u root -p ollama-chat < schema/schema.sql
-- ============================================================================

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

-- ============================================================================
-- DOCUMENTS TABLE
-- ============================================================================
-- Stores document metadata and semantic markdown representation

DROP TABLE IF EXISTS `documents`;
CREATE TABLE `documents` (
  `documentId` int(11) NOT NULL AUTO_INCREMENT,
  `documentUUID` varchar(36) NOT NULL,
  `documentTitle` varchar(255) NOT NULL,
  `documentType` enum('text','markdown','code','documentation','pdf') NOT NULL DEFAULT 'text',
  `documentTotalChunks` int(11) NOT NULL DEFAULT 0,
  `documentMarkdown` longtext DEFAULT NULL,
  `documentMetadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`documentMetadata`)),
  `documentCreatedAt` timestamp NULL DEFAULT current_timestamp(),
  `documentUpdatedAt` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`documentId`),
  UNIQUE KEY `documentUUID` (`documentUUID`),
  KEY `idx_uuid` (`documentUUID`),
  KEY `idx_title` (`documentTitle`),
  KEY `idx_type` (`documentType`),
  KEY `idx_created` (`documentCreatedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- DOCUMENT_CHUNKS TABLE
-- ============================================================================
-- Stores document chunks with vector embeddings for semantic search

DROP TABLE IF EXISTS `document_chunks`;
CREATE TABLE `document_chunks` (
  `chunkId` int(11) NOT NULL AUTO_INCREMENT,
  `chunkUUID` varchar(36) NOT NULL,
  `chunkDocumentId` int(11) NOT NULL,
  `chunkContent` text NOT NULL,
  `chunkIndex` int(11) NOT NULL,
  `chunkMetadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`chunkMetadata`)),
  `chunkEmbedding` vector(768) NOT NULL,
  `chunkCreatedAt` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`chunkId`),
  UNIQUE KEY `chunkUUID` (`chunkUUID`),
  KEY `idx_uuid` (`chunkUUID`),
  KEY `idx_document` (`chunkDocumentId`),
  KEY `idx_index` (`chunkIndex`),
  KEY `idx_created` (`chunkCreatedAt`),
  FULLTEXT KEY `idx_content_fulltext` (`chunkContent`),
  VECTOR KEY `chunkEmbedding` (`chunkEmbedding`) `M`=16 `DISTANCE`=cosine,
  CONSTRAINT `fk_chunk_document` FOREIGN KEY (`chunkDocumentId`) REFERENCES `documents` (`documentId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- CUSTOM_MODELS TABLE
-- ============================================================================
-- Stores custom AI model configurations (assistants)

DROP TABLE IF EXISTS `custom_models`;
CREATE TABLE `custom_models` (
  `modelId` INT(11) NOT NULL AUTO_INCREMENT,
  `modelUUID` VARCHAR(36) NOT NULL,
  `modelName` VARCHAR(255) NOT NULL,
  `modelDescription` TEXT DEFAULT NULL,
  `modelIcon` VARCHAR(10) DEFAULT '🤖',

  -- Ollama Configuration
  `ollamaModel` VARCHAR(100) NOT NULL DEFAULT 'llama3.2',
  `ollamaTemperature` DECIMAL(3,2) DEFAULT 0.7,
  `ollamaTopP` DECIMAL(3,2) DEFAULT 0.9,
  `ollamaTopK` INT DEFAULT 40,
  `ollamaRepeatPenalty` DECIMAL(3,2) DEFAULT 1.1,
  `ollamaSeed` INT DEFAULT NULL,

  -- RAG Configuration
  `useAdvancedRAG` BOOLEAN DEFAULT TRUE,
  `ragMaxChunks` INT DEFAULT 5,
  `ragSimilarityThreshold` DECIMAL(3,2) DEFAULT 0.30,
  `ragUseMultiQuery` BOOLEAN DEFAULT TRUE,
  `ragUseHybridSearch` BOOLEAN DEFAULT TRUE,
  `ragUseReranking` BOOLEAN DEFAULT TRUE,

  -- System Prompt
  `systemPrompt` TEXT NOT NULL DEFAULT 'You are a helpful AI assistant.',

  -- Context Settings
  `maxContextTokens` INT DEFAULT 16384,
  `maxOutputTokens` INT DEFAULT 4096,

  -- Metadata
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `isActive` BOOLEAN DEFAULT TRUE,
  `isDefault` BOOLEAN DEFAULT FALSE,

  PRIMARY KEY (`modelId`),
  UNIQUE KEY `modelUUID` (`modelUUID`),
  UNIQUE KEY `modelName` (`modelName`),
  KEY `idx_uuid` (`modelUUID`),
  KEY `idx_name` (`modelName`),
  KEY `idx_active` (`isActive`),
  KEY `idx_default` (`isDefault`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MODEL_DOCUMENTS TABLE (Many-to-Many)
-- ============================================================================
-- Associates custom models with their document libraries

DROP TABLE IF EXISTS `model_documents`;
CREATE TABLE `model_documents` (
  `modelDocumentId` INT(11) NOT NULL AUTO_INCREMENT,
  `modelId` INT(11) NOT NULL,
  `documentId` INT(11) NOT NULL,
  `addedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`modelDocumentId`),
  UNIQUE KEY `unique_model_document` (`modelId`, `documentId`),
  KEY `idx_model` (`modelId`),
  KEY `idx_document` (`documentId`),
  CONSTRAINT `fk_model_documents_model` FOREIGN KEY (`modelId`) REFERENCES `custom_models` (`modelId`) ON DELETE CASCADE,
  CONSTRAINT `fk_model_documents_document` FOREIGN KEY (`documentId`) REFERENCES `documents` (`documentId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- CHATS TABLE
-- ============================================================================
-- Stores chat conversations

DROP TABLE IF EXISTS `chats`;
CREATE TABLE `chats` (
  `chatId` int(11) NOT NULL AUTO_INCREMENT,
  `chatUUID` varchar(36) NOT NULL,
  `chatModel` varchar(100) NOT NULL DEFAULT 'llama3.2',
  `customModelId` INT(11) DEFAULT NULL,
  `chatCreated` timestamp NULL DEFAULT current_timestamp(),
  `chatUpdated` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`chatId`),
  UNIQUE KEY `chatUUID` (`chatUUID`),
  KEY `idx_uuid` (`chatUUID`),
  KEY `idx_created` (`chatCreated`),
  KEY `idx_updated` (`chatUpdated`),
  KEY `idx_custom_model` (`customModelId`),
  CONSTRAINT `fk_chat_custom_model` FOREIGN KEY (`customModelId`) REFERENCES `custom_models` (`modelId`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MESSAGES TABLE
-- ============================================================================
-- Stores chat messages (user and assistant)

DROP TABLE IF EXISTS `messages`;
CREATE TABLE `messages` (
  `messageId` int(11) NOT NULL AUTO_INCREMENT,
  `messageChat` int(11) NOT NULL,
  `messageUser` text DEFAULT NULL,
  `messageCreated` timestamp NULL DEFAULT current_timestamp(),
  `messagesystem` longtext DEFAULT NULL,
  PRIMARY KEY (`messageId`),
  KEY `idx_chat` (`messageChat`),
  KEY `idx_created` (`messageCreated`),
  CONSTRAINT `fk_message_chat` FOREIGN KEY (`messageChat`) REFERENCES `chats` (`chatId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert default custom model
INSERT INTO `custom_models` (
  `modelUUID`,
  `modelName`,
  `modelDescription`,
  `modelIcon`,
  `ollamaModel`,
  `systemPrompt`,
  `isDefault`
)
VALUES (
  UUID(),
  'Default Assistant',
  'A general-purpose AI assistant with document search capabilities',
  '🤖',
  'llama3.2',
  'You are a helpful AI assistant with access to a library of documents. When answering questions, cite relevant information from the provided context when available.',
  TRUE
)
ON DUPLICATE KEY UPDATE `modelName` = `modelName`;

-- ============================================================================
-- RESTORE SETTINGS
-- ============================================================================

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
