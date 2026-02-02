use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Poll{
    pub current_poll_deadline:i64,
    pub current_poll_winner_drawn:bool,
    pub bump:u8,
}