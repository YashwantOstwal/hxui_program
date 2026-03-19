use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct HxuiCandidate{
    pub id:u32,
    pub status:CandidateStatus,
    pub vote_count:u64,
    pub claim_back_offer:bool,
    pub claim_deadline:i64,
    pub bump:u8,
    pub receipt_count:u64,
    #[max_len(32)]
    pub name:String,
    #[max_len(280)]
    pub description:String,

}

#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Clone,InitSpace)]

pub enum CandidateStatus {
    Active,
    Withdrawn,
    Winner,
    ClaimableWinner
}