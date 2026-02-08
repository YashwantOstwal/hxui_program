use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct FreeTokensCounter{
    pub current_epoch:u64,
    pub remaining_free_tokens:u64,
    pub bump:u8
}