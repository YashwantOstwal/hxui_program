use anchor_lang::prelude::*;


#[account]
#[derive(InitSpace)]
pub struct FreeTokenTimestamp{
    pub next_mintable_timestamp:i64,
    pub closable_timestamp:i64,
    pub bump:u8
}