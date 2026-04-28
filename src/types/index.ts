export interface AuthCredentials {
  email: string;
  password: string;
  is_setup: boolean;
}

export interface SmtpSettings {
  host: string;
  port: number;
  username: string;
  password: string;
  from_name: string;
  from_email: string;
}

export interface EmailMapping {
  entity_name: string;
  to: string[];
  cc: string[];
  subject: string;
}

export interface FolderNode {
  name: string;
  children: FolderNode[];
}

export interface StatementType {
  name: string;
  sub_folders: FolderNode[];
}

export interface SelectedFolderNode {
  name: string;
  children: SelectedFolderNode[];
}

export interface SelectedStatementType {
  name: string;
  type_only: boolean;
  folders: SelectedFolderNode[];
}

export interface AutoEmailConfig {
  enabled: boolean;
  schedule: string;
  time: string;
  day_of_week: number;
  day_of_month: number;
  to: string[];
  cc: string[];
  subject: string;
  last_sent: string;
  last_status: string;
}

export interface AppSettings {
  auth: AuthCredentials;
  root_path: string;
  smtp: SmtpSettings;
  email_mappings: EmailMapping[];
  statement_types: StatementType[];
  auto_email: AutoEmailConfig;
}

export interface FolderResult {
  success: boolean;
  message: string;
  created: string[];
  skipped: string[];
}

export interface FileEntry {
  name: string;
  path: string;
  relative_path: string;
  extension: string;
  size_bytes: number;
  size_display: string;
  parent_folder: string;
  depth: number;
}

export interface FolderSummary {
  name: string;
  path: string;
  file_count: number;
  total_size: number;
}

export interface ExtensionSummary {
  extension: string;
  count: number;
  total_size: number;
}

export interface ScanResult {
  total_files: number;
  total_folders: number;
  total_size_bytes: number;
  total_size_display: string;
  files: FileEntry[];
  folder_summary: FolderSummary[];
  extension_summary: ExtensionSummary[];
}

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  from_name: string;
  from_email: string;
}

export interface EmailPayload {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  attachments: string[];
}

export type ToastType = 'success' | 'error';
export interface ToastMessage {
  id: string;
  type: ToastType;
  text: string;
  exiting?: boolean;
}
export type FolderMode = 'fy_only' | 'month_wise';
