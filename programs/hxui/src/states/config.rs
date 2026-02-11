use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config{
    pub admin: Pubkey,
    pub price_per_token:u64,
    pub tokens_per_vote:u64,
    pub bump: u8
}