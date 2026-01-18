"""
Advanced Tools for Amplifier Background Agent

Provides robust file system operations with sandboxing for legal document processing.
All file operations are restricted to the case_data directory for safety.
"""

import os
import json
import re
from pathlib import Path
from typing import List, Dict, Any, Optional, Union
from dataclasses import dataclass
from datetime import datetime
import logging

# Configure logging
logger = logging.getLogger(__name__)


class SandboxViolationError(Exception):
    """Raised when an operation attempts to access files outside the sandbox"""
    pass


@dataclass
class FileInfo:
    """Information about a file"""
    name: str
    path: str
    relative_path: str
    size: int
    is_directory: bool
    extension: str
    modified_time: datetime
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "path": self.relative_path,
            "size": self.size,
            "is_directory": self.is_directory,
            "extension": self.extension,
            "modified_time": self.modified_time.isoformat() if self.modified_time else None
        }


class FileSystemTool:
    """
    Sandboxed file system operations for the legal agent.
    
    All operations are restricted to a specific directory (sandbox) to prevent
    accidental modification of system files. This is critical for a background
    agent that runs autonomously without human supervision.
    """
    
    # Supported file extensions for reading
    READABLE_EXTENSIONS = {
        ".txt", ".md", ".py", ".js", ".ts", ".json", ".yaml", ".yml",
        ".html", ".css", ".csv", ".xml", ".log", ".ini", ".cfg",
        ".docx", ".pdf"  # These require special handling
    }
    
    # Extensions that can be created/written
    WRITABLE_EXTENSIONS = {
        ".txt", ".md", ".json", ".yaml", ".yml", ".csv", ".html", ".xml", ".log"
    }
    
    def __init__(self, sandbox_directory: str = "./case_data"):
        """
        Initialize the file system tool with a sandbox directory.
        
        Args:
            sandbox_directory: The root directory for all file operations.
                              All paths are relative to this directory.
        """
        self.sandbox_root = Path(sandbox_directory).resolve()
        
        # Create sandbox directory if it doesn't exist
        self.sandbox_root.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"[FileSystemTool] Initialized with sandbox: {self.sandbox_root}")
    
    def _resolve_path(self, path: str) -> Path:
        """
        Resolve a path within the sandbox, ensuring it doesn't escape.
        
        Args:
            path: A relative path within the sandbox
            
        Returns:
            Resolved absolute path
            
        Raises:
            SandboxViolationError: If the path escapes the sandbox
        """
        # Normalize the path to prevent traversal attacks
        normalized = os.path.normpath(path)
        
        # Remove leading slashes to make it relative
        normalized = normalized.lstrip("/\\")
        
        # Resolve the full path
        full_path = (self.sandbox_root / normalized).resolve()
        
        # Verify it's within the sandbox
        try:
            full_path.relative_to(self.sandbox_root)
        except ValueError:
            raise SandboxViolationError(
                f"Path '{path}' escapes the sandbox directory. "
                f"All operations must be within '{self.sandbox_root}'"
            )
        
        return full_path
    
    def _get_relative_path(self, full_path: Path) -> str:
        """Get the path relative to the sandbox root"""
        try:
            return str(full_path.relative_to(self.sandbox_root))
        except ValueError:
            return str(full_path)
    
    def list_directory(self, path: str = ".") -> Dict[str, Any]:
        """
        List contents of a directory within the sandbox.
        
        Args:
            path: Relative path to directory (default: sandbox root)
            
        Returns:
            Dictionary with directory contents
        """
        try:
            dir_path = self._resolve_path(path)
            
            if not dir_path.exists():
                return {"success": False, "error": f"Directory not found: {path}"}
            
            if not dir_path.is_dir():
                return {"success": False, "error": f"Not a directory: {path}"}
            
            items = []
            for item in sorted(dir_path.iterdir()):
                try:
                    stat = item.stat()
                    items.append(FileInfo(
                        name=item.name,
                        path=str(item),
                        relative_path=self._get_relative_path(item),
                        size=stat.st_size,
                        is_directory=item.is_dir(),
                        extension=item.suffix.lower() if item.is_file() else "",
                        modified_time=datetime.fromtimestamp(stat.st_mtime)
                    ).to_dict())
                except (PermissionError, OSError) as e:
                    logger.warning(f"Could not stat {item}: {e}")
            
            return {
                "success": True,
                "path": self._get_relative_path(dir_path),
                "item_count": len(items),
                "items": items
            }
            
        except SandboxViolationError as e:
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Error listing directory {path}: {e}")
            return {"success": False, "error": str(e)}
    
    def list_directory_recursive(
        self, 
        path: str = ".", 
        max_depth: int = 10,
        extensions: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Recursively list all files in a directory tree.
        
        Args:
            path: Starting directory path
            max_depth: Maximum recursion depth (default: 10)
            extensions: Filter by file extensions (e.g., [".pdf", ".txt"])
            
        Returns:
            Dictionary with all files found
        """
        try:
            start_path = self._resolve_path(path)
            
            if not start_path.exists():
                return {"success": False, "error": f"Directory not found: {path}"}
            
            if not start_path.is_dir():
                return {"success": False, "error": f"Not a directory: {path}"}
            
            files = []
            directories = []
            
            def scan_directory(current_path: Path, depth: int):
                if depth > max_depth:
                    return
                
                try:
                    for item in sorted(current_path.iterdir()):
                        try:
                            relative = self._get_relative_path(item)
                            
                            if item.is_dir():
                                directories.append(relative)
                                scan_directory(item, depth + 1)
                            else:
                                # Check extension filter
                                if extensions:
                                    if item.suffix.lower() not in extensions:
                                        continue
                                
                                stat = item.stat()
                                files.append(FileInfo(
                                    name=item.name,
                                    path=str(item),
                                    relative_path=relative,
                                    size=stat.st_size,
                                    is_directory=False,
                                    extension=item.suffix.lower(),
                                    modified_time=datetime.fromtimestamp(stat.st_mtime)
                                ).to_dict())
                        except (PermissionError, OSError) as e:
                            logger.warning(f"Could not access {item}: {e}")
                except PermissionError as e:
                    logger.warning(f"Could not access directory {current_path}: {e}")
            
            scan_directory(start_path, 0)
            
            return {
                "success": True,
                "base_path": self._get_relative_path(start_path),
                "total_files": len(files),
                "total_directories": len(directories),
                "files": files,
                "directories": directories
            }
            
        except SandboxViolationError as e:
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Error in recursive listing {path}: {e}")
            return {"success": False, "error": str(e)}
    
    def read_file(self, path: str, max_size: int = 1_000_000) -> Dict[str, Any]:
        """
        Read the contents of a file.
        
        Supports text files (.txt, .md, .py, etc.) directly.
        For PDF and DOCX, attempts basic text extraction.
        
        Args:
            path: Path to the file
            max_size: Maximum file size to read (default: 1MB)
            
        Returns:
            Dictionary with file contents
        """
        try:
            file_path = self._resolve_path(path)
            
            if not file_path.exists():
                return {"success": False, "error": f"File not found: {path}"}
            
            if file_path.is_dir():
                return {"success": False, "error": f"Cannot read directory as file: {path}"}
            
            # Check file size
            size = file_path.stat().st_size
            if size > max_size:
                return {
                    "success": False, 
                    "error": f"File too large ({size} bytes). Maximum: {max_size} bytes"
                }
            
            extension = file_path.suffix.lower()
            
            # Handle different file types
            if extension == ".pdf":
                return self._read_pdf(file_path)
            elif extension == ".docx":
                return self._read_docx(file_path)
            elif extension == ".json":
                return self._read_json(file_path)
            else:
                # Default: read as text
                return self._read_text(file_path)
            
        except SandboxViolationError as e:
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Error reading file {path}: {e}")
            return {"success": False, "error": str(e)}
    
    def _read_text(self, file_path: Path) -> Dict[str, Any]:
        """Read a plain text file"""
        try:
            # Try UTF-8 first, then fall back to latin-1
            try:
                content = file_path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                content = file_path.read_text(encoding="latin-1")
            
            return {
                "success": True,
                "path": self._get_relative_path(file_path),
                "content": content,
                "size": len(content),
                "type": "text"
            }
        except Exception as e:
            return {"success": False, "error": f"Failed to read text file: {e}"}
    
    def _read_json(self, file_path: Path) -> Dict[str, Any]:
        """Read and parse a JSON file"""
        try:
            content = file_path.read_text(encoding="utf-8")
            data = json.loads(content)
            
            return {
                "success": True,
                "path": self._get_relative_path(file_path),
                "content": content,
                "data": data,
                "size": len(content),
                "type": "json"
            }
        except json.JSONDecodeError as e:
            return {"success": False, "error": f"Invalid JSON: {e}"}
        except Exception as e:
            return {"success": False, "error": f"Failed to read JSON file: {e}"}
    
    def _read_pdf(self, file_path: Path) -> Dict[str, Any]:
        """
        Read text from a PDF file.
        Requires PyPDF2 or pdfplumber to be installed.
        """
        try:
            # Try PyPDF2 first
            try:
                import PyPDF2
                
                with open(file_path, "rb") as f:
                    reader = PyPDF2.PdfReader(f)
                    text_parts = []
                    for page in reader.pages:
                        text = page.extract_text()
                        if text:
                            text_parts.append(text)
                    
                    content = "\n\n".join(text_parts)
                    
                    return {
                        "success": True,
                        "path": self._get_relative_path(file_path),
                        "content": content,
                        "size": len(content),
                        "page_count": len(reader.pages),
                        "type": "pdf"
                    }
            except ImportError:
                pass
            
            # Try pdfplumber as fallback
            try:
                import pdfplumber
                
                with pdfplumber.open(file_path) as pdf:
                    text_parts = []
                    for page in pdf.pages:
                        text = page.extract_text()
                        if text:
                            text_parts.append(text)
                    
                    content = "\n\n".join(text_parts)
                    
                    return {
                        "success": True,
                        "path": self._get_relative_path(file_path),
                        "content": content,
                        "size": len(content),
                        "page_count": len(pdf.pages),
                        "type": "pdf"
                    }
            except ImportError:
                pass
            
            # No PDF library available
            return {
                "success": False,
                "error": "PDF reading requires PyPDF2 or pdfplumber. Install with: pip install PyPDF2",
                "path": self._get_relative_path(file_path),
                "type": "pdf"
            }
            
        except Exception as e:
            return {"success": False, "error": f"Failed to read PDF: {e}"}
    
    def _read_docx(self, file_path: Path) -> Dict[str, Any]:
        """
        Read text from a DOCX file.
        Requires python-docx to be installed.
        """
        try:
            from docx import Document
            
            doc = Document(file_path)
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            content = "\n\n".join(paragraphs)
            
            return {
                "success": True,
                "path": self._get_relative_path(file_path),
                "content": content,
                "size": len(content),
                "paragraph_count": len(paragraphs),
                "type": "docx"
            }
        except ImportError:
            return {
                "success": False,
                "error": "DOCX reading requires python-docx. Install with: pip install python-docx",
                "path": self._get_relative_path(file_path),
                "type": "docx"
            }
        except Exception as e:
            return {"success": False, "error": f"Failed to read DOCX: {e}"}
    
    def write_file(
        self, 
        path: str, 
        content: str, 
        overwrite: bool = False
    ) -> Dict[str, Any]:
        """
        Write content to a file.
        
        Args:
            path: Path where to write the file
            content: Content to write
            overwrite: Whether to overwrite existing files
            
        Returns:
            Dictionary with result
        """
        try:
            file_path = self._resolve_path(path)
            
            # Check extension is writable
            extension = file_path.suffix.lower()
            if extension and extension not in self.WRITABLE_EXTENSIONS:
                return {
                    "success": False,
                    "error": f"Cannot write to {extension} files. Allowed: {', '.join(self.WRITABLE_EXTENSIONS)}"
                }
            
            # Check if file exists
            if file_path.exists() and not overwrite:
                return {
                    "success": False,
                    "error": f"File already exists: {path}. Set overwrite=True to replace."
                }
            
            # Create parent directories if needed
            file_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Write the file
            file_path.write_text(content, encoding="utf-8")
            
            logger.info(f"[FileSystemTool] Wrote {len(content)} bytes to {path}")
            
            return {
                "success": True,
                "path": self._get_relative_path(file_path),
                "size": len(content),
                "overwritten": file_path.exists() and overwrite
            }
            
        except SandboxViolationError as e:
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Error writing file {path}: {e}")
            return {"success": False, "error": str(e)}
    
    def append_file(self, path: str, content: str) -> Dict[str, Any]:
        """
        Append content to an existing file.
        
        Args:
            path: Path to the file
            content: Content to append
            
        Returns:
            Dictionary with result
        """
        try:
            file_path = self._resolve_path(path)
            
            if not file_path.exists():
                return {"success": False, "error": f"File not found: {path}"}
            
            with open(file_path, "a", encoding="utf-8") as f:
                f.write(content)
            
            return {
                "success": True,
                "path": self._get_relative_path(file_path),
                "appended_size": len(content)
            }
            
        except SandboxViolationError as e:
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Error appending to file {path}: {e}")
            return {"success": False, "error": str(e)}
    
    def create_directory(self, path: str) -> Dict[str, Any]:
        """
        Create a directory within the sandbox.
        
        Args:
            path: Path for the new directory
            
        Returns:
            Dictionary with result
        """
        try:
            dir_path = self._resolve_path(path)
            
            if dir_path.exists():
                if dir_path.is_dir():
                    return {
                        "success": True,
                        "path": self._get_relative_path(dir_path),
                        "already_existed": True
                    }
                else:
                    return {"success": False, "error": f"A file exists at {path}"}
            
            dir_path.mkdir(parents=True, exist_ok=True)
            
            return {
                "success": True,
                "path": self._get_relative_path(dir_path),
                "already_existed": False
            }
            
        except SandboxViolationError as e:
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Error creating directory {path}: {e}")
            return {"success": False, "error": str(e)}
    
    def file_exists(self, path: str) -> Dict[str, Any]:
        """Check if a file or directory exists"""
        try:
            file_path = self._resolve_path(path)
            exists = file_path.exists()
            
            return {
                "success": True,
                "path": self._get_relative_path(file_path),
                "exists": exists,
                "is_file": file_path.is_file() if exists else None,
                "is_directory": file_path.is_dir() if exists else None
            }
            
        except SandboxViolationError as e:
            return {"success": False, "error": str(e)}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_file_info(self, path: str) -> Dict[str, Any]:
        """Get detailed information about a file"""
        try:
            file_path = self._resolve_path(path)
            
            if not file_path.exists():
                return {"success": False, "error": f"File not found: {path}"}
            
            stat = file_path.stat()
            
            return {
                "success": True,
                "path": self._get_relative_path(file_path),
                "name": file_path.name,
                "extension": file_path.suffix.lower(),
                "size": stat.st_size,
                "is_file": file_path.is_file(),
                "is_directory": file_path.is_dir(),
                "created_time": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                "modified_time": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "readable": file_path.suffix.lower() in self.READABLE_EXTENSIONS,
                "writable": file_path.suffix.lower() in self.WRITABLE_EXTENSIONS
            }
            
        except SandboxViolationError as e:
            return {"success": False, "error": str(e)}
        except Exception as e:
            return {"success": False, "error": str(e)}


# Tool definitions for the agent (OpenAI function calling format)
FILESYSTEM_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_directory",
            "description": "List contents of a directory within the case_data sandbox. Returns files and subdirectories.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path to directory (default: root of case_data)"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_directory_recursive",
            "description": "Recursively list all files in a directory tree. Use this to find all documents in a folder structure.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Starting directory path"
                    },
                    "max_depth": {
                        "type": "integer",
                        "description": "Maximum recursion depth (default: 10)"
                    },
                    "extensions": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Filter by file extensions (e.g., ['.pdf', '.txt'])"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the contents of a file. Supports .txt, .md, .pdf, .docx, .json, and other text formats.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the file to read"
                    },
                    "max_size": {
                        "type": "integer",
                        "description": "Maximum file size in bytes (default: 1MB)"
                    }
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write content to a file. Creates parent directories if needed. Use for creating legal documents, memos, and summaries.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path where to write the file"
                    },
                    "content": {
                        "type": "string",
                        "description": "Content to write to the file"
                    },
                    "overwrite": {
                        "type": "boolean",
                        "description": "Whether to overwrite if file exists (default: false)"
                    }
                },
                "required": ["path", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "file_exists",
            "description": "Check if a file or directory exists",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to check"
                    }
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_directory",
            "description": "Create a new directory within the sandbox",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path for the new directory"
                    }
                },
                "required": ["path"]
            }
        }
    }
]


def execute_filesystem_tool(tool_name: str, args: Dict[str, Any], fs_tool: FileSystemTool) -> Dict[str, Any]:
    """
    Execute a filesystem tool call.
    
    Args:
        tool_name: Name of the tool to execute
        args: Arguments for the tool
        fs_tool: FileSystemTool instance to use
        
    Returns:
        Tool execution result
    """
    tool_map = {
        "list_directory": lambda: fs_tool.list_directory(args.get("path", ".")),
        "list_directory_recursive": lambda: fs_tool.list_directory_recursive(
            args.get("path", "."),
            args.get("max_depth", 10),
            args.get("extensions")
        ),
        "read_file": lambda: fs_tool.read_file(
            args.get("path", ""),
            args.get("max_size", 1_000_000)
        ),
        "write_file": lambda: fs_tool.write_file(
            args.get("path", ""),
            args.get("content", ""),
            args.get("overwrite", False)
        ),
        "file_exists": lambda: fs_tool.file_exists(args.get("path", "")),
        "create_directory": lambda: fs_tool.create_directory(args.get("path", "")),
        "get_file_info": lambda: fs_tool.get_file_info(args.get("path", "")),
        "append_file": lambda: fs_tool.append_file(
            args.get("path", ""),
            args.get("content", "")
        )
    }
    
    if tool_name in tool_map:
        return tool_map[tool_name]()
    else:
        return {"success": False, "error": f"Unknown filesystem tool: {tool_name}"}
