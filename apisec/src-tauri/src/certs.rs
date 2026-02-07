use rcgen::{
    BasicConstraints, Certificate, CertificateParams, IsCa, KeyPair,
    KeyUsagePurpose, DistinguishedName, SanType,
};
use std::sync::Arc;
use tokio_rustls::rustls;
use std::collections::HashMap;
use tokio::sync::Mutex;
use chrono::{Utc, Duration};

pub struct CertManager {
    ca_cert: Certificate,
    cache: Arc<Mutex<HashMap<String, rustls::ServerConfig>>>,
}

impl CertManager {
    pub fn new() -> Self {
        let mut params = CertificateParams::default();
        params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
        params.distinguished_name = DistinguishedName::new();
        params.distinguished_name.push(rcgen::DnType::CommonName, "APISec Analyst Root CA");
        params.key_usages.push(rcgen::KeyUsagePurpose::DigitalSignature);
        params.key_usages.push(rcgen::KeyUsagePurpose::KeyCertSign);
        params.key_usages.push(rcgen::KeyUsagePurpose::CrlSign);
        
        let ca_cert = Certificate::generate_from_params(params).unwrap();
        
        Self {
            ca_cert,
            cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn get_server_config(&self, domain: &str) -> Arc<rustls::ServerConfig> {
        let mut cache = self.cache.lock().await;
        if let Some(config) = cache.get(domain) {
            return Arc::new(config.clone());
        }

        let mut params = CertificateParams::default();
        params.distinguished_name = DistinguishedName::new();
        params.distinguished_name.push(rcgen::DnType::CommonName, domain);
        params.subject_alt_names.push(SanType::DnsName(domain.to_string()));
        params.key_usages.push(rcgen::KeyUsagePurpose::DigitalSignature);
        
        let cert = Certificate::generate_from_params(params).unwrap();
        let cert_signed = cert.serialize_der_with_signer(&self.ca_cert).unwrap();
        let key_der = cert.get_key_pair().serialize_der();
        
        let cert_chain = vec![rustls::pki_types::CertificateDer::from(cert_signed)];
        let key_der_pki = rustls::pki_types::PrivatePkcs8KeyDer::from(key_der);
        let key_der_wrapped = rustls::pki_types::PrivateKeyDer::Pkcs8(key_der_pki);

        let config = rustls::ServerConfig::builder()
            .with_no_client_auth()
            .with_single_cert(cert_chain, key_der_wrapped)
            .unwrap();

        cache.insert(domain.to_string(), config.clone());
        Arc::new(config)
    }

    pub fn get_ca_pem(&self) -> String {
        self.ca_cert.pem()
    }
}
