use lettre::message::{header::ContentType, Attachment, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub from_name: String,
    pub from_email: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EmailPayload {
    pub to: Vec<String>,
    pub cc: Vec<String>,
    pub subject: String,
    pub body: String,
    pub attachments: Vec<String>, // file paths
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EmailResult {
    pub success: bool,
    pub message: String,
}

#[tauri::command]
pub fn send_email(smtp_config: SmtpConfig, email: EmailPayload) -> Result<EmailResult, String> {
    if email.to.is_empty() {
        return Err("No recipients specified".to_string());
    }

    // Build the message
    let from = format!("{} <{}>", smtp_config.from_name, smtp_config.from_email)
        .parse()
        .map_err(|e| format!("Invalid from address: {}", e))?;

    let mut builder = Message::builder()
        .from(from)
        .subject(&email.subject);

    // Add TO recipients
    for to_addr in &email.to {
        let addr = to_addr
            .parse()
            .map_err(|e| format!("Invalid TO address '{}': {}", to_addr, e))?;
        builder = builder.to(addr);
    }

    // Add CC recipients
    for cc_addr in &email.cc {
        let addr = cc_addr
            .parse()
            .map_err(|e| format!("Invalid CC address '{}': {}", cc_addr, e))?;
        builder = builder.cc(addr);
    }

    // Build multipart with body + attachments
    let mut multipart = MultiPart::mixed().singlepart(
        SinglePart::builder()
            .header(ContentType::TEXT_HTML)
            .body(email.body.clone()),
    );

    // Attach files
    for file_path in &email.attachments {
        let path = Path::new(file_path);
        if !path.exists() {
            return Err(format!("Attachment not found: {}", file_path));
        }

        let filename = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let content = fs::read(path)
            .map_err(|e| format!("Failed to read attachment '{}': {}", file_path, e))?;

        let content_type = if filename.ends_with(".pdf") {
            ContentType::parse("application/pdf").unwrap()
        } else if filename.ends_with(".xlsx") {
            ContentType::parse(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            .unwrap()
        } else {
            ContentType::parse("application/octet-stream").unwrap()
        };

        let attachment = Attachment::new(filename).body(content, content_type);
        multipart = multipart.singlepart(attachment);
    }

    let message = builder
        .multipart(multipart)
        .map_err(|e| format!("Failed to build email: {}", e))?;

    // Create SMTP transport
    let creds = Credentials::new(smtp_config.username.clone(), smtp_config.password.clone());

    let mailer = if smtp_config.port == 465 {
        SmtpTransport::relay(&smtp_config.host)
            .map_err(|e| format!("SMTP relay error: {}", e))?
            .credentials(creds)
            .port(smtp_config.port)
            .timeout(Some(Duration::from_secs(15)))
            .build()
    } else {
        SmtpTransport::starttls_relay(&smtp_config.host)
            .map_err(|e| format!("SMTP STARTTLS error: {}", e))?
            .credentials(creds)
            .port(smtp_config.port)
            .timeout(Some(Duration::from_secs(15)))
            .build()
    };

    // Send
    match mailer.send(&message) {
        Ok(_) => Ok(EmailResult {
            success: true,
            message: format!("Email sent to {} recipients", email.to.len() + email.cc.len()),
        }),
        Err(e) => Err(format!("Failed to send email: {}", e)),
    }
}
