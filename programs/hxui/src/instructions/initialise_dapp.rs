use anchor_lang::{prelude::*, system_program::{Transfer,transfer}};
use anchor_spl::{
    token_interface::{ Mint,Token2022,token_metadata_initialize,TokenMetadataInitialize},
};
use spl_token_metadata_interface::state::TokenMetadata;
use spl_type_length_value::variable_len_pack::VariableLenPack;


use crate::{ANCHOR_DISCRIMINATOR, Config, CustomError, FREE_TOKENS_PER_EPOCH, FreeTokensCounter, VoteReceipt};
#[derive(Accounts)]
pub struct InitialiseDapp<'info>{
    #[account(mut)]
    pub admin:Signer<'info>,

    pub lite_authority :SystemAccount<'info>,

    #[account(
        mut,
        seeds = [b"hxui_vault"],
        bump
    )]
    pub hxui_vault:SystemAccount<'info>,

    #[account(
        init,
        payer = admin,
        seeds = [b"hxui_mint"],
        bump,
        mint::decimals = 0,
        mint::authority = hxui_mint,
        mint::token_program = token_program,
        extensions::metadata_pointer::authority = hxui_mint,
        extensions::metadata_pointer::metadata_address = hxui_mint
    )]
    pub hxui_mint:InterfaceAccount<'info,Mint>,

    #[account(
        init,
        payer = admin,
        seeds = [b"hxui_config"],
        bump,
        space = ANCHOR_DISCRIMINATOR + Config::INIT_SPACE
    )]
    pub hxui_config: Account<'info,Config>,

    #[account(
        init,
        payer = admin,
        seeds = [b"hxui_lite_mint"],
        bump,
        mint::decimals = 0,
        mint::authority = lite_authority,
        mint::token_program = token_program,
    )]
    pub hxui_lite_mint:InterfaceAccount<'info,Mint>,

    #[account(
        init,
        payer = admin,
        seeds = [b"hxui_free_tokens_counter"],
        bump,
        space = ANCHOR_DISCRIMINATOR + FreeTokensCounter::INIT_SPACE
    )]
    pub free_tokens_counter:Account<'info,FreeTokensCounter>,

    pub system_program:Program<'info,System>,
    pub token_program:Program<'info,Token2022>
}

pub struct TokenMetadataArgs {
    name:String,
    symbol:String,
    uri:String,
}
pub fn initialise_config(ctx:Context<InitialiseDapp>,config:Config)->Result<()>{
    let rent = Rent::get()?;
    require!(2* config.price_per_token >= rent.minimum_balance(VoteReceipt::INIT_SPACE) ,CustomError::TokenPriceNotSufficient);
    let config_account = &mut ctx.accounts.hxui_config;
    config_account.set_inner(config);

    let free_tokens_counter = &mut ctx.accounts.free_tokens_counter;
    free_tokens_counter.bump = ctx.bumps.free_tokens_counter;
    free_tokens_counter.current_epoch = (Clock::get()?).epoch;
    free_tokens_counter.remaining_free_tokens = FREE_TOKENS_PER_EPOCH;

    let cpi_context = CpiContext::new(ctx.accounts.system_program.to_account_info(),Transfer{
        from:ctx.accounts.admin.to_account_info(),
        to:ctx.accounts.hxui_vault.to_account_info()
    });
    let rent = Rent::get()?;
    transfer(cpi_context, rent.minimum_balance(0))?;

    let hxui_metadata   = TokenMetadataArgs{name:"100xui".to_string(),symbol:"HXUI".to_string(),uri:"https://raw.githubusercontent.com/solana-developers/opos-asset/main/assets/DeveloperPortal/metadata.json".to_string()};

    let hxui_metadata_state = TokenMetadata{
        name:hxui_metadata.name.clone(),
        uri:hxui_metadata.uri.clone(),
        symbol:hxui_metadata.symbol.clone(),
        ..Default::default()
    };
    let packed_metadata = hxui_metadata_state.get_packed_len();
    
    if let Ok(metadata_len) = packed_metadata {
    let cpi_context = CpiContext::new(ctx.accounts.system_program.to_account_info(),Transfer{
        from:ctx.accounts.admin.to_account_info(),
        to:ctx.accounts.hxui_mint.to_account_info()
    });
    let amount = rent.minimum_balance(metadata_len);
    transfer(cpi_context,amount)?;
        
        let seeds:&[&[u8]] = &[b"hxui_mint",&[ctx.bumps.hxui_mint]];
        let signer_seeds = [&seeds[..]];
        let hxui_metadata_context = CpiContext::new(ctx.accounts.token_program.to_account_info(),TokenMetadataInitialize{
            program_id:ctx.accounts.token_program.to_account_info(),
            mint: ctx.accounts.hxui_mint.to_account_info(),
            metadata: ctx.accounts.hxui_mint.to_account_info(),
            update_authority: ctx.accounts.hxui_mint.to_account_info(),
            mint_authority: ctx.accounts.hxui_mint.to_account_info(),
        }).with_signer(&signer_seeds);
        token_metadata_initialize(hxui_metadata_context, hxui_metadata.name, hxui_metadata.symbol, hxui_metadata.uri)?;
    }
    Ok(())

}