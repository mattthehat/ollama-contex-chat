-- -------------------------------------------------------------
-- TablePlus 6.7.0(634)
--
-- https://tableplus.com/
--
-- Database: ollama-chat
-- Generation Time: 2025-12-27 11:16:14.3600
-- -------------------------------------------------------------


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


DROP TABLE IF EXISTS `chats`;
CREATE TABLE `chats` (
  `chatId` int(11) NOT NULL AUTO_INCREMENT,
  `chatUUID` varchar(36) NOT NULL,
  `chatModel` varchar(100) NOT NULL DEFAULT 'llama3.2',
  `chatCreated` timestamp NULL DEFAULT current_timestamp(),
  `chatUpdated` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`chatId`),
  UNIQUE KEY `chatUUID` (`chatUUID`),
  KEY `idx_uuid` (`chatUUID`),
  KEY `idx_created` (`chatCreated`),
  KEY `idx_updated` (`chatUpdated`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  VECTOR KEY `chunkEmbedding` (`chunkEmbedding`) `M`=16 `DISTANCE`=cosine,
  CONSTRAINT `1` FOREIGN KEY (`chunkDocumentId`) REFERENCES `documents` (`documentId`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1545 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  CONSTRAINT `1` FOREIGN KEY (`messageChat`) REFERENCES `chats` (`chatId`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;