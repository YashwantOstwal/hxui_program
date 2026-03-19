use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct HxuiConfig{
    pub admin: Pubkey,
    pub price_per_token:u64,
    pub tokens_per_vote:u64,
    pub free_tokens_per_mint:u64,
    pub free_mints_per_epoch:u64,
    pub free_mint_cool_down:i64,
    pub bump: u8
}