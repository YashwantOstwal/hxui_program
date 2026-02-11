use anchor_lang::prelude::*;

use crate::{ Candidate, CandidateStatus, Config, CustomError, VoteReceipt};
#[derive(Accounts)]
#[instruction(name:String)]
pub struct ClearReceipt<'info>{
    
    pub admin:Signer<'info>,

    #[account(
        has_one = admin,
        seeds = [b"hxui_config"],
        bump = hxui_config.bump
    )]
    pub hxui_config:Account<'info,Config>,
    #[account(
        mut,
        seeds = [b"hxui_candidate",name.as_bytes()],
        bump = hxui_candidate.bump,
    )]
    pub hxui_candidate:Account<'info,Candidate>,

     #[account(
        mut,
        seeds = [b"hxui_vault"],
        bump
    )]
    pub hxui_vault:SystemAccount<'info>,

    #[account(
        mut,
        close = hxui_vault,
        constraint = vote_receipt.id == hxui_candidate.id @ CustomError::InvalidReceiptForCandidate
    )]
    pub vote_receipt:Account<'info,VoteReceipt>,
   
}

pub fn close_receipt_account(ctx:Context<ClearReceipt>)->Result<()>{
    let candidate = &mut ctx.accounts.hxui_candidate;

    // This ixn can only be invoked for vote receipts of candidate whose status is winner, withdrawn or claimable winner after the withdraw window is closed.
    require!(candidate.candidate_status != CandidateStatus::Active,CustomError::ReceiptsCannotBeClosedForAnActiveCandidate);

    let clock = Clock::get()?;
    require!(candidate.claim_window!=0 && clock.unix_timestamp > candidate.claim_window ,CustomError::OpenWithdrawWindowFirst);
    
    candidate.total_receipts -= 1;
    Ok(())
}