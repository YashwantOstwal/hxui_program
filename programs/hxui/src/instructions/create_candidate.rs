use anchor_lang::prelude::*;

use anchor_spl::{
    token_interface::{Mint,Token2022},
};
use crate::{ANCHOR_DISCRIMINATOR, Candidate, Config, CustomError,Poll };

#[derive(Accounts)]
#[instruction(name:String,description:String)]
pub struct CreateCandidate<'info>{
    #[account(mut)]
    pub admin:Signer<'info>,

    #[account(
        has_one = admin,
        seeds = [b"hxui_config"],
        bump = hxui_config.bump
    )]
    pub hxui_config:Account<'info,Config>,

    #[account(
        init,
        payer = admin,
        space = ANCHOR_DISCRIMINATOR + Candidate::INIT_SPACE,
        seeds = [b"hxui_candidate",name.as_bytes()],
        bump,
        constraint = description.len() <= 280 @ CustomError::DescriptionTooLong
    )]
    pub hxui_candidate:Account<'info,Candidate>,

    #[account(
        seeds = [b"hxui_mint"],
        bump,
        mint::decimals = 0,
        mint::authority = hxui_mint,
        mint::token_program = token_program
    )]
    pub hxui_mint:InterfaceAccount<'info,Mint>,


    #[account(
        mut,
        seeds = [b"hxui_poll"],
        bump = hxui_poll.bump,
    )]
    pub hxui_poll:Account<'info,Poll>,

    pub system_program:Program<'info,System>,
    pub token_program:Program<'info,Token2022>,
}


pub fn initialise_candidate(ctx:Context<CreateCandidate>,name:String,description:String,claimable_if_winner:bool,claimable_bps:Option<u16>)->Result<()>{
   let claimable_basis_points_if_winner = match claimable_bps{
        Some(basis_points)=>basis_points,
        None=>5000
    };
    let candidate  = &mut ctx.accounts.hxui_candidate;
    let poll = &mut ctx.accounts.hxui_poll;
    let id = poll.total_candidates;

    candidate.set_inner(Candidate { name, description, number_of_votes: 0, is_winner: false,claimable_if_winner, can_be_winner: true, bump: ctx.bumps.hxui_candidate,claimable_basis_points_if_winner,claim_window:0,id,total_receipts:0 });
    
    poll.current_poll_candidates.push(id);
    poll.total_candidates +=1;
    
    Ok(())
}
