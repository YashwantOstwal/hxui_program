use anchor_lang::prelude::*;


#[account]
#[derive(InitSpace)]
pub struct FreeMintTracker{
    pub next_mint_timestamp:i64,
    pub unregistered:bool,
    pub bump:u8
}