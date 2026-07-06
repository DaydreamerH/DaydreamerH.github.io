function(add_blending_demo TARGET_NAME SOURCE_FILE FRAGMENT_SHADER TEXTURE_FILE)
    add_executable(${TARGET_NAME} ${SOURCE_FILE} ${GLAD_SOURCE})

    if(WIN32)
        target_link_libraries(${TARGET_NAME} glfw opengl32)
    endif()

    foreach(FILE_NAME blending.vs ${FRAGMENT_SHADER} singleColor.vs singleColor.fs)
        add_custom_command(TARGET ${TARGET_NAME} POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
            "$<TARGET_FILE_DIR:${TARGET_NAME}>/${FILE_NAME}"
        )
    endforeach()

    add_custom_command(TARGET ${TARGET_NAME} POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_SOURCE_DIR}/images/${TEXTURE_FILE}"
        "$<TARGET_FILE_DIR:${TARGET_NAME}>/${TEXTURE_FILE}"
    )
endfunction()

add_blending_demo(17_blending_grass grass.cpp grass.fs grass.png)
add_blending_demo(17_blending_window window.cpp window.fs blending_transparent_window.png)
