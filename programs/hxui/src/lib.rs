pub mod instructions;
pub mod states;
pub mod constants;
pub mod errors;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use states::*;
pub use constants::*;
pub use errors::*;
declare_id!("EpF1FNjziFb8wrR1p5usVW1AbcU7saCt8deoiVY31zE7");

#[program]
pub mod hxui {
    use super::*;

    pub fn initialise_dapp(ctx:Context<InitialiseDapp>,price_per_token:u64,tokens_per_vote:u64,is_claim_back_offer_live:bool,claim_basis_points:u32)->Result<()>{
        let config_bump: u8  = ctx.bumps.hxui_config;
        let admin_pubkey: Pubkey = ctx.accounts.admin.key();
        instructions::initialise_dapp::initialise_config(
            ctx,
            Config { 
                admin:admin_pubkey,
                price_per_token,
                tokens_per_vote,
                is_claim_back_offer_live,
                claim_basis_points,
                bump:config_bump
            }
        )
    }
    pub fn create_poll(ctx:Context<CreatePoll>,poll_deadline:i64)->Result<()>{
        instructions::create_poll::create_new_poll(ctx, poll_deadline)
    }

    pub fn draw_winner(ctx:Context<PickWinner>)->Result<()>{
        instructions::pick_winner::pick_winner(ctx)
    }

    pub fn register_for_free_tokens(ctx:Context<RegisterFreeTokens>)->Result<()>{
        instructions::register_for_free_tokens::initialise_hxui_lite_minted_timestamp(ctx)
    }  
    pub fn mint_free_tokens(ctx:Context<MintFreeTokens>)->Result<()>{
        instructions::mint_free_tokens::mint_tokens(ctx,1)
    }
}
