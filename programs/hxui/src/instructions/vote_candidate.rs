use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint,TokenAccount,Token2022,Burn,burn},
};
use crate::{Candidate, Config, CustomError,ANCHOR_DISCRIMINATOR,VoteReceipt};
#[derive(Accounts)]
#[instruction(name:String)]
pub struct VoteCandidate<'info>{
    #[account(mut)] // for now, the owner is mutable soon it will be a vault
    pub owner:Signer<'info>,

    #[account(
        mut,
        associated_token::authority = owner,
        associated_token::mint = hxui_mint,
        associated_token::token_program = token_program
    )]
    pub hxui_token_account:InterfaceAccount<'info,TokenAccount>,

     #[account(
        mut,
        seeds = [b"hxui_mint"],
        bump,
        mint::decimals = 0,
        mint::authority = hxui_mint,
        mint::token_program = token_program
    )]
    pub hxui_mint:InterfaceAccount<'info,Mint>,

    #[account(
        mut,
        seeds = [b"hxui_candidate",name.as_bytes()],
        bump = hxui_candidate.bump,
        constraint = hxui_candidate.is_winner == false @ CustomError::CandidateAlreadyAWinner,
        constraint = hxui_candidate.can_be_winner == true @ CustomError::CandidateIsNoLongerVotable
    )]
    pub hxui_candidate:Account<'info,Candidate>,

    
    #[account(
        init_if_needed,
        payer = owner,
        space = ANCHOR_DISCRIMINATOR + VoteReceipt::INIT_SPACE,
        seeds = [b"vote_receipt",name.as_bytes(),owner.key().as_ref()],
        bump,
    )]
    pub vote_receipt:Account<'info,VoteReceipt>,

    #[account(
        seeds = [b"hxui_config"],
        bump = hxui_config.bump,
    )]
    pub hxui_config: Account<'info,Config>,

    pub system_program:Program<'info,System>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub token_program:Program<'info,Token2022>,
}

pub fn vote(ctx:Context<VoteCandidate>,votes:u64)->Result<()>{
    let candidate = &mut ctx.accounts.hxui_candidate;
    let vote_receipt = &mut ctx.accounts.vote_receipt;
    let config = & ctx.accounts.hxui_config;
    if vote_receipt.tokens == 0{
        candidate.total_receipts +=1;
        vote_receipt.bump = ctx.bumps.vote_receipt;
        vote_receipt.id = candidate.id;
    }

    let tokens_spent = votes * config.tokens_per_vote;
    vote_receipt.tokens += tokens_spent;
    
    candidate.number_of_votes += votes;
    let cpi_context = CpiContext::new(ctx.accounts.token_program.to_account_info(),Burn{
        mint:ctx.accounts.hxui_mint.to_account_info(),
        from:ctx.accounts.hxui_token_account.to_account_info(),
        authority:ctx.accounts.owner.to_account_info()
    });

    burn(cpi_context,tokens_spent )
}