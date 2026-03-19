use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct HxuiFreeMintCounter{
    pub current_epoch:u64,
    pub remaining_free_mints:u64,
    pub bump:u8
}