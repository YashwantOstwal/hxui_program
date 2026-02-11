use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Candidate{
    pub id:u32,
    #[max_len(32)]
    pub name:String,

    #[max_len(280)]
    pub description:String,

    pub number_of_votes:u64,
    // pub is_winner:bool,
    // pub can_be_winner:bool,
    pub candidate_status:CandidateStatus,
    pub claimable_if_winner:bool,
    // pub claimable_basis_points_if_winner:u16,
    pub claim_window:i64,
    pub bump:u8,
    pub total_receipts:u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Clone,InitSpace)]

pub enum CandidateStatus {
    Active,
    Withdrawn,
    Winner,
    ClaimableWinner
}