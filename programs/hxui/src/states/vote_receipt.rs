use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct VoteReceipt{
    pub id:u32,
    pub tokens:u64,
    pub bump:u8,
}
