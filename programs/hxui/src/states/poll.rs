use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Poll{
    pub current_poll_deadline:i64,
    pub current_poll_winner_drawn:bool,
    pub bump:u8,
    #[max_len(20)]
    pub current_poll_candidates:Vec<u32>,
    pub total_candidates:u32

}