#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Env};
#[contract]
pub struct Probe;
#[contractimpl]
impl Probe {
    pub fn ping(_env: Env, caller: Address) {
        caller.require_auth();
    }
}
