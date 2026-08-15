#![cfg(test)]
extern crate std;

use super::*;
use ed25519_dalek::{Signer as DalekSigner, SigningKey};
use soroban_sdk::Env;

fn keypair(seed: u8) -> SigningKey {
    SigningKey::from_bytes(&[seed; 32])
}

#[test]
fn verify_accepts_a_genuine_signature() {
    let e = Env::default();
    let contract_id = e.register(AgentVerifier, ());
    let client = AgentVerifierClient::new(&e, &contract_id);

    let signing_key = keypair(7);
    let public_key = BytesN::from_array(&e, &signing_key.verifying_key().to_bytes());
    let message = b"phase-6b-external-signer-retry";
    let signature = signing_key.sign(message);

    let hash = Bytes::from_slice(&e, message);
    let sig_data = BytesN::from_array(&e, &signature.to_bytes());

    assert!(client.verify(&hash, &public_key, &sig_data));
}

#[test]
#[should_panic]
fn verify_panics_on_a_signature_from_a_different_key() {
    let e = Env::default();
    let contract_id = e.register(AgentVerifier, ());
    let client = AgentVerifierClient::new(&e, &contract_id);

    let signing_key = keypair(7);
    let other_key = keypair(9);
    let public_key = BytesN::from_array(&e, &signing_key.verifying_key().to_bytes());
    let message = b"phase-6b-external-signer-retry";
    // Signed by a different key than the one being checked against.
    let signature = other_key.sign(message);

    let hash = Bytes::from_slice(&e, message);
    let sig_data = BytesN::from_array(&e, &signature.to_bytes());

    client.verify(&hash, &public_key, &sig_data);
}

#[test]
#[should_panic]
fn verify_panics_on_a_tampered_message() {
    let e = Env::default();
    let contract_id = e.register(AgentVerifier, ());
    let client = AgentVerifierClient::new(&e, &contract_id);

    let signing_key = keypair(7);
    let public_key = BytesN::from_array(&e, &signing_key.verifying_key().to_bytes());
    let signature = signing_key.sign(b"the message that was actually signed");

    let hash = Bytes::from_slice(&e, b"a different message entirely");
    let sig_data = BytesN::from_array(&e, &signature.to_bytes());

    client.verify(&hash, &public_key, &sig_data);
}

#[test]
fn canonicalize_key_is_the_raw_32_bytes() {
    let e = Env::default();
    let contract_id = e.register(AgentVerifier, ());
    let client = AgentVerifierClient::new(&e, &contract_id);

    let signing_key = keypair(3);
    let raw = signing_key.verifying_key().to_bytes();
    let public_key = BytesN::from_array(&e, &raw);

    let canonical = client.canonicalize_key(&public_key);
    assert_eq!(canonical, Bytes::from_slice(&e, &raw));
}

#[test]
fn batch_canonicalize_key_preserves_order() {
    let e = Env::default();
    let contract_id = e.register(AgentVerifier, ());
    let client = AgentVerifierClient::new(&e, &contract_id);

    let raw1 = keypair(1).verifying_key().to_bytes();
    let raw2 = keypair(2).verifying_key().to_bytes();
    let keys = Vec::from_array(
        &e,
        [
            BytesN::from_array(&e, &raw1),
            BytesN::from_array(&e, &raw2),
        ],
    );

    let canonical = client.batch_canonicalize_key(&keys);
    assert_eq!(canonical.get(0).unwrap(), Bytes::from_slice(&e, &raw1));
    assert_eq!(canonical.get(1).unwrap(), Bytes::from_slice(&e, &raw2));
}
