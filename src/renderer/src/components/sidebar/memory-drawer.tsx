import { Box, Button } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import {
    DrawerRoot,
    DrawerTrigger,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerBody,
    DrawerFooter,
    DrawerActionTrigger,
    DrawerBackdrop,
    DrawerCloseTrigger,
} from '@/components/ui/drawer';
import { sidebarStyles } from './sidebar-styles';
import { MemoryViewer } from '../memory-viewer/memory-viewer';

interface MemoryDrawerProps {
    children: React.ReactNode;
}

function MemoryDrawer({ children }: MemoryDrawerProps): JSX.Element {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);

    return (
        <DrawerRoot
            open={open}
            onOpenChange={(e) => setOpen(e.open)}
            placement="start"
        >
            <DrawerBackdrop />
            <DrawerTrigger asChild>{children}</DrawerTrigger>
            <DrawerContent style={sidebarStyles.memoryDrawer.drawer.content}>
                <DrawerHeader>
                    <DrawerTitle style={sidebarStyles.memoryDrawer.drawer.title}>
                        Memory Bank
                    </DrawerTitle>
                    <DrawerCloseTrigger style={sidebarStyles.memoryDrawer.drawer.closeButton} />
                </DrawerHeader>

                <DrawerBody>
                    <Box {...sidebarStyles.memoryDrawer.listContainer}>
                        <MemoryViewer />
                    </Box>
                </DrawerBody>

                <DrawerFooter>
                    <DrawerActionTrigger asChild>
                        <Button {...sidebarStyles.memoryDrawer.drawer.actionButton}>
                            {t('common.close') || 'Close'}
                        </Button>
                    </DrawerActionTrigger>
                </DrawerFooter>
            </DrawerContent>
        </DrawerRoot>
    );
}

export default MemoryDrawer;
