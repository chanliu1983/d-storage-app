use anchor_lang::prelude::*;

declare_id!("Ed5i4GsQCTU5NLvgieHUWHFAGfBJ61NfktWw271fesEJ");

#[program]
pub mod d_storage_app {
    use super::*;

    pub fn save(ctx: Context<Save>, key: String, value: String) -> Result<()> {
        let data = &mut ctx.accounts.data;
        data.key = key;
        data.value = value;
        msg!("Saved key-value pair: {} = {}", data.key, data.value);
        Ok(())
    }

    pub fn query(ctx: Context<Query>) -> Result<()> {
        let data = &ctx.accounts.data;
        msg!("Query result: {} = {}", data.key, data.value);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Save<'info> {
    #[account(init, payer = signer, space = 8 + 4 + 32 + 4 + 100)] // 8 for discriminator, 4 for string length, 32 for key, 4 for string length, 100 for value
    pub data: Account<'info, KeyValue>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Query<'info> {
    pub data: Account<'info, KeyValue>,
}

#[account]
pub struct KeyValue {
    pub key: String,
    pub value: String,
}
