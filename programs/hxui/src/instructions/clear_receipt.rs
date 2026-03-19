use anchor_lang::prelude::*;

use crate::{ HxuiCandidate, CandidateStatus, HxuiConfig, CustomError, VoteReceipt};
#[derive(Accounts)]
#[instruction(name:String)]
pub struct ClearReceipt<'info>{
    
    pub admin:Signer<'info>,

    #[account(
        has_one = admin,
        seeds = [b"hxui_config"],
        bump = hxui_config.bump
    )]
    pub hxui_config:Account<'info,HxuiConfig>,
    #[account(
        mut,
        seeds = [b"hxui_candidate",name.as_bytes()],
        bump = hxui_candidate.bump,
    )]
    pub hxui_candidate:Account<'info,HxuiCandidate>,

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
    // require!(candidate.status != CandidateStatus::Active,CustomError::ReceiptsCannotBeClosedForAnActiveCandidate);

    
    candidate.receipt_count -= 1;

    match candidate.status {
        CandidateStatus::Active=>{
            err!(CustomError::ReceiptsCannotBeClosedForAnActiveCandidate)
        },
        CandidateStatus::Winner=>{
            Ok(())
        }
        _=>{
            let clock = Clock::get()?;
            require!(candidate.claim_deadline!=0 ,CustomError::OpenWithdrawWindowFirst);
            require!(clock.unix_timestamp > candidate.claim_deadline,CustomError::WaitUntilWithdrawWindowIsClosed);
            Ok(())
        }
    }

}