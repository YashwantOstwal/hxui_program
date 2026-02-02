use anchor_lang::prelude::*;


#[account]
#[derive(InitSpace)]
pub struct FreeTokenTimestamp{
    pub last_minted_timestamp:i64,
    pub bump:u8
}