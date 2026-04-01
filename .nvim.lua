vim.api.nvim_create_autocmd({ "BufRead", "BufNewFile" }, {
	pattern = "*/templates/*.yaml",
	callback = function()
		vim.bo.filetype = "helm"
	end,
})

vim.api.nvim_create_autocmd({ "BufRead", "BufNewFile" }, {
	pattern = "Chart.yaml",
	callback = function()
		vim.bo.filetype = "helm"
	end,
})

vim.api.nvim_create_autocmd({ "BufRead", "BufNewFile" }, {
	pattern = "values.yaml",
	callback = function()
		vim.bo.filetype = "helm"
	end,
})
