use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config{
    pub admin: Pubkey,
    pub price_per_token:u64,
    pub tokens_per_vote:u64,
    pub is_claim_back_offer_live:bool,
    pub claim_basis_points:u32,
    pub bump: u8
}