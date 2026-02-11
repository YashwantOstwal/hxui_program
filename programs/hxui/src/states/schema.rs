
use anchor_lang::prelude::*;


#[account]
#[derive(InitSpace)]
pub struct Schema{
    pub id: u32,
}
