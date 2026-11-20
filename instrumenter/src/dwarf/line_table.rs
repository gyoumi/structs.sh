//! Reads where each statement starts from the DWARF line table.

use super::UnitReader;

impl UnitReader<'_, '_> {
    /// The is_stmt rows in the program's own file, not code from headers.
    pub(super) fn statement_rows(&self) -> gimli::Result<Vec<(u64, u32)>> {
        let mut found = Vec::new();
        let Some(program) = self.unit.line_program.clone() else {
            return Ok(found);
        };
        let unit_file = self.unit.name.map(|name| name.slice().to_vec());
        let mut rows = program.rows();
        while let Some((header, row)) = rows.next_row()? {
            let Some(line) = row.line() else { continue };
            let file = row
                .file(header)
                .map(|file| self.dwarf.attr_string(self.unit, file.path_name()))
                .transpose()?;
            if row.is_stmt()
                && !row.end_sequence()
                && file.map(|name| name.slice().to_vec()) == unit_file
            {
                found.push((row.address(), line.get() as u32));
            }
        }
        Ok(found)
    }
}
