use anchor_lang::prelude::*;

declare_id!("Ed5i4GsQCTU5NLvgieHUWHFAGfBJ61NfktWw271fesEJ");

#[program]
pub mod d_storage_app {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let data = &mut ctx.accounts.data;
        data.message = "Greetings from d-storage-app!".to_string();
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = signer, space = 8 + 100)]
    pub data: Account<'info, Data>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Data {
    pub message: String,  // This will store up to 100 bytes
}
