use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct HxuiDropTime{
    pub drop_timestamp:i64,
    pub is_winner_drawn:bool,
    pub bump:u8,
    #[max_len(20)]
    pub active_candidate_ids:Vec<u32>,
    pub total_candidate_count:u32

}